import BigNumber from "bignumber.js"
import Link from "next/link"
import React from "react"
import { useSelector } from "react-redux"
import { RootState, TokenState } from "store/types"
import useMoneyFormatter, { toBigNumber } from "utils/useMoneyFormatter"
import EmptyRow from "./EmptyRow"
import FlashChange from "./FlashChange"
import TokenIcon from "./TokenIcon"

function PortfolioBalances() {
  const moneyFormat = useMoneyFormatter({ maxFractionDigits: 5 })
  const tokenState = useSelector<RootState, TokenState>(state => state.token)

  let zilRate = tokenState.zilRate

  let filteredTokens = tokenState.tokens.filter(token => {
    return token.balance !== null && token.balance !== undefined && !toBigNumber(token.balance).isZero()
  })

  filteredTokens.sort((a, b) => {
    const priorBalance = toBigNumber(a.balance, {compression: a.decimals})
    const priorZilRate = a.isZil ? priorBalance : priorBalance.times(a.rate)
    const priorUsdRate = priorZilRate.times(zilRate)

    const nextBalance = toBigNumber(b.balance, {compression: b.decimals})
    const nextZilRate = b.isZil ? nextBalance : nextBalance.times(b.rate)
    const nextUsdRate = nextZilRate.times(zilRate)
    
    return (priorUsdRate.isLessThan(nextUsdRate)) ? 1 : -1
  })

  var totalBalance = tokenState.tokens.reduce((sum, current) => {
    let balance = toBigNumber(current.balance, {compression: current.decimals})

    if(current.isZil) return sum.plus(balance)

    return sum.plus(balance.times(current.rate))
  }, new BigNumber(0))

  return (
    <>
      <div className="font-bold text-2xl">Balances</div>
      <div className="scrollable-table-container max-w-full overflow-x-scroll">
        <table className="zilstream-table table-fixed border-collapse">
          <colgroup>
            <col style={{width: '240px', minWidth: 'auto'}} />
            <col style={{width: '120px', minWidth: 'auto'}} />
            <col style={{width: '120px', minWidth: 'auto'}} />
            <col style={{width: '120px', minWidth: 'auto'}} />
            <col style={{width: '80px', minWidth: 'auto'}} />
          </colgroup>
          <thead className="text-gray-500 dark:text-gray-400 text-xs">
            <tr>
              <th className="pl-4 pr-2 py-2 text-left">Token</th>
              <th className="px-2 py-2 text-right">Price</th>
              <th className="px-2 py-2 text-right">Balance</th>
              <th className="px-2 py-2 text-right">Holdings</th>
              <th className="px-2 py-2 text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {filteredTokens.map((token, index) => {
              let balance = toBigNumber(token.balance, {compression: token.decimals})

              let rate = token.rate
              let zilBalance = (token.isZil) ? balance.toNumber() : (Number(balance) * rate)
              let usdBalance = zilBalance * zilRate

              let share = (zilBalance / totalBalance.toNumber()) * 100
              
              return (
                <tr key={token.address_bech32} role="row" className="text-sm border-b dark:border-gray-700 last:border-b-0">
                  <td className={`pl-4 pr-2 py-4 font-medium ${index === 0 ? 'rounded-tl-lg' : ''} ${index === filteredTokens.length-1 ? 'rounded-bl-lg' : ''}`}>
                    <Link href={`/tokens/${token.symbol.toLowerCase()}`}>
                      <a className="flex items-center">
                        <div className="w-6 h-6 flex-shrink-0 flex-grow-0 mr-3">
                          <TokenIcon url={token.icon} />
                        </div>
                        <span className="hidden lg:inline">{token.name}</span>
                        <span className="lg:font-normal ml-2 lg:text-gray-500">{token.symbol}</span>
                      </a>
                    </Link>
                  </td>
                  <td className="px-2 py-2 font-normal text-right">
                    {moneyFormat(rate, {
                      symbol: 'ZIL',
                      compression: 0,
                      maxFractionDigits: 2,
                      showCurrency: false,
                    })}
                  </td>
                  <td className="px-2 py-2 font-normal text-right">
                    {moneyFormat(token.balance, {
                      symbol: token.symbol,
                      compression: token.decimals,
                      maxFractionDigits: 2,
                      showCurrency: false,
                    })}
                  </td>
                  <td className="px-2 py-2 font-normal text-right whitespace-nowrap">
                    <div>
                      <FlashChange value={usdBalance}>
                        <span>${moneyFormat(usdBalance, {compression: 0, maxFractionDigits: 2})}</span>
                      </FlashChange>
                    </div>
                    <div className="text-gray-500">
                      <FlashChange value={zilBalance}>
                        {token.isZil ? (
                          <span>{moneyFormat(token.balance, {
                            symbol: token.symbol,
                            compression: token.decimals,
                            maxFractionDigits: 2,
                            showCurrency: false,
                          })}</span>
                        ) : (
                          <span>{moneyFormat(zilBalance, {compression: 0, maxFractionDigits: 2})}</span>
                        )}
                      </FlashChange> ZIL
                    </div>
                  </td>
                  <td className={`px-2 py-2 font-normal text-right ${index === 0 ? 'rounded-tr-lg' : ''} ${index === filteredTokens.length-1 ? 'rounded-br-lg' : ''}`}>
                    {moneyFormat(share, {
                      symbol: '',
                      compression: 0,
                      maxFractionDigits: 2,
                      showCurrency: false,
                    })}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filteredTokens.length === 0 &&
          <EmptyRow message="Currently not holding any tokens." />
        }
      </div>
    </>
  )
}

export default PortfolioBalances