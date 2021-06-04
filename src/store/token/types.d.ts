import BigNumber from 'bignumber.js'

export type TokenInfo = {
  id: string
  name: string
  symbol: string
  icon: string
  address_bech32: string
  decimals: number
  init_supply: number
  max_supply: number
  total_supply: number
  current_supply: number
  daily_volume: number
  current_liquidity: number
  website: string
  whitepaper: string
  viewblock_score: number
  supply_skip_addresses: string
  unvetted: boolean
  isZil: boolean
  isStream: boolean
  rate: number
  balance?: BigNumber = 0
  pool?: TokenPool
}

export type TokenPool = {
  zilReserve: BigNumber
  tokenReserve: BigNumber
  exchangeRate: BigNumber
  totalContribution: BigNumber
  userContribution?: BigNumber
  contributionPercentage?: BigNumber
}

export interface TokenState {
  initialized: boolean,
  zilRate: number,
  tokens: TokenInfo[]
}

export interface TokenInitProps {
  tokens: TokenInfo[]
}

export interface TokenUpdateProps extends Partial<TokenInfo> {
  address_bech32: string
}

export interface TokenAddProps {
  token: TokenInfo
}

export interface TokenPoolUpdateProps extends Partial<TokenPool> {
  address: string
}