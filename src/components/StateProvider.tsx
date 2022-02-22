import getZilRates from 'lib/coingecko/getZilRates'
import { STREAM_ADDRESS, ZIL_ADDRESS } from 'lib/constants'
import getPortfolioState from 'lib/zilstream/getPortfolio'
import getTokens from 'lib/zilstream/getTokens'
import React, { useEffect, useState } from 'react'
import { batch, useDispatch, useSelector, useStore } from 'react-redux'
import { startSagas } from 'saga/saga'
import { AccountActionTypes, updateWallet } from 'store/account/actions'
import { setAlertState, updateAlert } from 'store/alert/actions'
import { CurrencyActionTypes } from 'store/currency/actions'
import { setNotificationState } from 'store/notification/actions'
import { updateSettings } from 'store/settings/actions'
import { updateSwap } from 'store/swap/actions'
import { TokenActionTypes } from 'store/token/actions'
import { AccountState, AlertState, BlockchainState, NotificationState, RootState, SettingsState, StakingState, SwapState, Token, TokenState } from 'store/types'
import { Indicator, Metric } from 'types/metric.interface'
import { AccountType } from 'types/walletType.interface'
import { getTokenAPR } from 'utils/apr'
import { BatchResponse, sendBatchRequest, stakingDelegatorsBatchRequest } from 'utils/batch'
import { cryptoFormat, currencyFormat } from 'utils/format'
import { useInterval } from 'utils/interval'
import { processBatch } from 'utils/processBatch'

interface Props {
  children: React.ReactNode
}

const StateProvider = (props: Props) => {
  const blockchainState = useSelector<RootState, BlockchainState>(state => state.blockchain)
  const accountState = useSelector<RootState, AccountState>(state => state.account)
  const tokenState = useSelector<RootState, TokenState>(state => state.token)
  const stakingState = useSelector<RootState, StakingState>(state => state.staking)
  const settingsState = useSelector<RootState, SettingsState>(state => state.settings)
  const swapState = useSelector<RootState, SwapState>(state => state.swap)
  const alertState = useSelector<RootState, AlertState>(state => state.alert)
  const notificationState = useSelector<RootState, NotificationState>(state => state.notification)
  const dispatch = useDispatch()
  const [stakingLoaded, setStakingLoaded] = useState(false)

  async function loadTokens() {
    const tokens = await getTokens()
    if(tokens.length === 0) return

    batch(() => {
      if(!tokenState.initialized) {
        for (let i = 0; i < tokens.length; i++) {
          tokens[i].isZil = tokens[i].address_bech32 === ZIL_ADDRESS
          tokens[i].isStream = tokens[i].address_bech32 === STREAM_ADDRESS
        }
        dispatch({type: TokenActionTypes.TOKEN_INIT, payload: {tokens}})
      } else {
        tokens.forEach(token => {
          const { address_bech32, ...tokenDetails} = token
          dispatch({type: TokenActionTypes.TOKEN_UPDATE, payload: {
            address_bech32: address_bech32,
            ...tokenDetails
          }})
        })
      }
    })

    if(tokens.length > 0 && swapState.tokenInAddress === null && swapState.tokenOutAddress === null) {
      dispatch(updateSwap({
        tokenInAddress: tokens.filter(t => t.symbol === 'ZIL')[0].address_bech32,
        tokenOutAddress: tokens.filter(t => t.symbol === 'STREAM')[0].address_bech32
      }))
    }

    processAlerts()
  }

  async function setFavorites() {
    const favoritesString = localStorage.getItem('favorites') ?? ''
    var favorites = favoritesString.split(',')

    batch(() => {
      favorites.forEach(address => {
        dispatch({type: TokenActionTypes.TOKEN_UPDATE, payload: {
          address_bech32: address,
          isFavorited: true
        }})
      })
    })
  }

  async function setTokenAPRs() {
    batch(() => {
      tokenState.tokens.forEach(token => {
        const apr = getTokenAPR(token, tokenState)
        dispatch({type: TokenActionTypes.TOKEN_UPDATE, payload: {
          address_bech32: token.address_bech32,
          apr: apr
        }})
      })
    })
  }

  async function loadZilRates() {
    const zilRates = await getZilRates()
    batch(() => {
      Object.entries(zilRates.zilliqa).map(([key, value]: [string, any]) => {
        dispatch({type: CurrencyActionTypes.CURRENCY_UPDATE, payload: {
          code: key.toUpperCase(),
          rate: value as number
        }})
      })

      dispatch({type: CurrencyActionTypes.CURRENCY_SELECT, payload: {currency: localStorage.getItem('selectedCurrency') ?? 'USD'}})
    })
  }

  async function loadWalletState() {
    if(!accountState.selectedWallet || tokenState.initialized === false) return
    let batchResults = await getPortfolioState(accountState.selectedWallet.address, tokenState.tokens, stakingState.operators)

    await processBatchResults(batchResults)
  }

  async function fetchStakingState() {
    if(!accountState.selectedWallet) return
    const walletAddress = accountState.selectedWallet.address
    
    const batchRequests: any[] = [];
    stakingState.operators.forEach(operator => {
      batchRequests.push(stakingDelegatorsBatchRequest(operator, walletAddress))
    })
    let batchResults = await sendBatchRequest(batchRequests)
    await processBatchResults(batchResults)
  }

  async function processBatchResults(batchResults: BatchResponse[]) {
    if(!accountState.selectedWallet) return
    const walletAddress = accountState.selectedWallet.address

    processBatch(batchResults, walletAddress, dispatch)
  }

  async function loadSettings() {
    const settingsStr = localStorage.getItem('settings')

    if(settingsStr) {
      const settings: SettingsState = JSON.parse(settingsStr)
      dispatch(updateSettings({
        ...settings,
        initialized: true
      }))
    }
  }

  async function loadAlerts() {
    const alertsStr = localStorage.getItem('alerts')

    if(alertsStr) {
      const alerts: AlertState = JSON.parse(alertsStr)
      dispatch(setAlertState({
        ...alerts,
        initialized: true
      }))
    }
  }

  async function loadNotifications() {
    const notificationsStr = localStorage.getItem('notifications')

    if(notificationsStr) {
      const notifications: NotificationState = JSON.parse(notificationsStr)
      dispatch(setNotificationState({
        ...notifications,
        initialized: true
      }))
    }
  }

  async function processAlerts() {
    // Return early if the notification permission isn't granted.
    if(Notification.permission !== 'granted') return

    let alerts = alertState.alerts
    alerts.forEach(alert => {
      // Check if the alert has already been triggered, if the case skip it immediately.
      if(alert.triggered) return

      let token = tokenState.tokens.filter(token => token.address_bech32 === alert.token_address)?.[0]
      let currentRate = alert.metric === Metric.PriceZIL ? token.market_data.rate : token.market_data.rate_usd
      let targetRate = alert.value

      if(alert.indicator === Indicator.Above) {
        if(currentRate >= targetRate) {
          dispatch(updateAlert({
            previous: alert,
            triggered: true
          }))
          sendPriceNotificationForToken(token)
        }
      } else if(alert.indicator === Indicator.Below) {
        dispatch(updateAlert({
          previous: alert,
          triggered: true
        }))

        if(currentRate <= targetRate) {
          sendPriceNotificationForToken(token)
        }
      }
    })

    function sendPriceNotificationForToken(token: Token) {
      new Notification(`${token.symbol}: ${cryptoFormat(token.market_data.rate)} ZIL (${currencyFormat(token.market_data.rate_usd)})`, {
        body: `${token.name}'s (${token.symbol}) current price is ${cryptoFormat(token.market_data.rate)} ZIL (${currencyFormat(token.market_data.rate_usd)}).`,
        icon: token.icon
      })
    }
  }

  useInterval(async () => {
    loadZilRates()
  }, 20000)

  useEffect(() => {
    if(!tokenState.initialized) return
    loadTokens()
    loadWalletState()
  }, [blockchainState.blockHeight])

  useEffect(() => {
    loadSettings()
    loadAlerts()
    loadNotifications()
    loadTokens()
    loadZilRates()

    startSagas()
  }, [])

  useEffect(() => {
    if(!tokenState.initialized) return
    setFavorites()
    setTokenAPRs()
  }, [tokenState.initialized])

  useEffect(() => {
    if(!tokenState.initialized || !accountState.selectedWallet) return
    loadWalletState()
  }, [accountState.selectedWallet, tokenState.initialized])

  useEffect(() => {
    if(stakingState.operators.length === 0 || stakingLoaded) return
    setStakingLoaded(true)
    fetchStakingState()
  }, [stakingState])

  useEffect(() => {
    if(!accountState.initialized) return
    // This makes sure all account changes persist.
    localStorage.setItem('account', JSON.stringify(accountState))    
  }, [accountState])

  useEffect(() => {
    if(!alertState.initialized) return
    localStorage.setItem('alerts', JSON.stringify(alertState))
  }, [alertState])

  useEffect(() => {
    if(!notificationState.initialized) return
    localStorage.setItem('notifications', JSON.stringify(notificationState))
  }, [notificationState])

  useEffect(() => {
    const accountString = localStorage.getItem('account')
    if(accountString) {
      const account: AccountState = JSON.parse(accountString)
      account.initialized = true
      account.wallets = account.wallets.map(a => ({...a, isConnected: false }))

      dispatch({ type: AccountActionTypes.INIT_ACCOUNT, payload: account })

      if(account.wallets.filter(a => a.type === AccountType.ZilPay).length > 0) {
        // Has ZilPay wallet, try to connect
        connectZilPay()
      }
    } else {
      dispatch({ type: AccountActionTypes.INIT_ACCOUNT, payload: {
        initialized: true,
        network: "mainnet",
        wallets: [],
        selectedWallet: null
      }})
    }
  }, [])

  useEffect(() => {
    if(!settingsState.initialized) return
    localStorage.setItem('settings', JSON.stringify(settingsState))
  }, [settingsState])

  if (typeof(window) !== 'undefined') {
    // @ts-ignore
    import('zeeves-auth-sdk-js');
  }

  const connectZilPay = async () => {
    const zilPay = (window as any).zilPay
    
    // Check if ZilPay is installed
    if(typeof zilPay === "undefined") {
      console.log("ZilPay extension not installed")
      return
    }
      
    const result = await zilPay.wallet.connect()

    if(result !== zilPay.wallet.isConnect) {
      console.log("Could not connect to ZilPay")
      return
    }

    const walletAddress = zilPay.wallet.defaultAccount.bech32
    dispatch(updateWallet({address: walletAddress, isConnected: true}))
  }
  
  return <>{props.children}</>
}

export default StateProvider