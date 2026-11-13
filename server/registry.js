// Default network and token registry. Seeded into the database on first run;
// after that the admin panel is the source of truth.

const pn = (name) => `https://${name}.publicnode.com`;

export const DEFAULT_CHAINS = [
  { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', family: 'utxo', addressKey: 'bitcoin', decimals: 8, cg: 'bitcoin', color: '#F7931A', glyph: '₿',
    explorerAddr: 'https://mempool.space/address/', explorerTx: 'https://mempool.space/tx/', rpc: 'https://mempool.space/api' },
  { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', family: 'evm', addressKey: 'evm', chainId: 1, decimals: 18, cg: 'ethereum', color: '#8C9EFF', glyph: 'Ξ',
    explorerAddr: 'https://etherscan.io/address/', explorerTx: 'https://etherscan.io/tx/', rpc: pn('ethereum-rpc') },
  { id: 'solana', name: 'Solana', symbol: 'SOL', family: 'solana', addressKey: 'solana', decimals: 9, cg: 'solana', color: '#14F195', glyph: 'S',
    explorerAddr: 'https://solscan.io/account/', explorerTx: 'https://solscan.io/tx/', rpc: pn('solana-rpc') },
  { id: 'bsc', name: 'BNB Smart Chain', symbol: 'BNB', family: 'evm', addressKey: 'evm', chainId: 56, decimals: 18, cg: 'binancecoin', color: '#F3BA2F', glyph: 'B',
    explorerAddr: 'https://bscscan.com/address/', explorerTx: 'https://bscscan.com/tx/', rpc: pn('bsc-rpc') },
  { id: 'ripple', name: 'XRP Ledger', symbol: 'XRP', family: 'xrp', addressKey: 'ripple', decimals: 6, cg: 'ripple', color: '#C9D1D9', glyph: 'X',
    explorerAddr: 'https://xrpscan.com/account/', explorerTx: 'https://xrpscan.com/tx/', rpc: 'https://xrplcluster.com' },
  { id: 'tron', name: 'TRON', symbol: 'TRX', family: 'tron', addressKey: 'tron', decimals: 6, cg: 'tron', color: '#FF3B4E', glyph: 'T',
    explorerAddr: 'https://tronscan.org/#/address/', explorerTx: 'https://tronscan.org/#/transaction/', rpc: 'https://api.trongrid.io' },
  { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', family: 'utxo', addressKey: 'dogecoin', decimals: 8, cg: 'dogecoin', color: '#C2A633', glyph: 'Ð',
    explorerAddr: 'https://dogechain.info/address/', explorerTx: 'https://dogechain.info/tx/', rpc: 'https://api.blockcypher.com/v1/doge/main' },
  { id: 'litecoin', name: 'Litecoin', symbol: 'LTC', family: 'utxo', addressKey: 'litecoin', decimals: 8, cg: 'litecoin', color: '#A6B8D4', glyph: 'Ł',
    explorerAddr: 'https://litecoinspace.org/address/', explorerTx: 'https://litecoinspace.org/tx/', rpc: 'https://litecoinspace.org/api' },
  { id: 'polygon', name: 'Polygon', symbol: 'POL', family: 'evm', addressKey: 'evm', chainId: 137, decimals: 18, cg: 'polygon-ecosystem-token', color: '#A26BFF', glyph: 'P',
    explorerAddr: 'https://polygonscan.com/address/', explorerTx: 'https://polygonscan.com/tx/', rpc: pn('polygon-bor-rpc') },
  { id: 'avalanche', name: 'Avalanche C-Chain', symbol: 'AVAX', family: 'evm', addressKey: 'evm', chainId: 43114, decimals: 18, cg: 'avalanche-2', color: '#FF5A5F', glyph: 'A',
    explorerAddr: 'https://snowtrace.io/address/', explorerTx: 'https://snowtrace.io/tx/', rpc: pn('avalanche-c-chain-rpc') },
  { id: 'arbitrum', name: 'Arbitrum One', symbol: 'ETH', family: 'evm', addressKey: 'evm', chainId: 42161, decimals: 18, cg: 'ethereum', color: '#5CB8FF', glyph: 'Ξ',
    explorerAddr: 'https://arbiscan.io/address/', explorerTx: 'https://arbiscan.io/tx/', rpc: pn('arbitrum-one-rpc') },
  { id: 'optimism', name: 'OP Mainnet', symbol: 'ETH', family: 'evm', addressKey: 'evm', chainId: 10, decimals: 18, cg: 'ethereum', color: '#FF4D61', glyph: 'Ξ',
    explorerAddr: 'https://optimistic.etherscan.io/address/', explorerTx: 'https://optimistic.etherscan.io/tx/', rpc: pn('optimism-rpc') },
  { id: 'base', name: 'Base', symbol: 'ETH', family: 'evm', addressKey: 'evm', chainId: 8453, decimals: 18, cg: 'ethereum', color: '#6E9BFF', glyph: 'Ξ',
    explorerAddr: 'https://basescan.org/address/', explorerTx: 'https://basescan.org/tx/', rpc: pn('base-rpc') },
  { id: 'cosmos', name: 'Cosmos Hub', symbol: 'ATOM', family: 'cosmos', addressKey: 'cosmos', decimals: 6, cg: 'cosmos', color: '#B7BEDC', glyph: '⚛',
    explorerAddr: 'https://www.mintscan.io/cosmos/address/', explorerTx: 'https://www.mintscan.io/cosmos/tx/', rpc: pn('cosmos-rest') },
  { id: 'sepolia', name: 'Sepolia testnet', symbol: 'ETH', family: 'evm', addressKey: 'evm', chainId: 11155111, decimals: 18, cg: null, color: '#9AA3B8', glyph: 'Ξ', testnet: true,
    explorerAddr: 'https://sepolia.etherscan.io/address/', explorerTx: 'https://sepolia.etherscan.io/tx/', rpc: pn('ethereum-sepolia-rpc') },
];

export const DEFAULT_TOKENS = [
  { chain: 'ethereum', contract: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', name: 'Tether', decimals: 6, cg: 'tether' },
  { chain: 'ethereum', contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', name: 'USD Coin', decimals: 6, cg: 'usd-coin' },
  { chain: 'ethereum', contract: '0x6b175474e89094c44da98b954eedeac495271d0f', symbol: 'DAI', name: 'Dai', decimals: 18, cg: 'dai' },
  { chain: 'ethereum', contract: '0x514910771af9ca656af840dff83e8264ecf986ca', symbol: 'LINK', name: 'Chainlink', decimals: 18, cg: 'chainlink' },
  { chain: 'ethereum', contract: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', symbol: 'UNI', name: 'Uniswap', decimals: 18, cg: 'uniswap' },
  { chain: 'ethereum', contract: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', symbol: 'SHIB', name: 'Shiba Inu', decimals: 18, cg: 'shiba-inu' },
  { chain: 'bsc', contract: '0x55d398326f99059ff775485246999027b3197955', symbol: 'USDT', name: 'Tether', decimals: 18, cg: 'tether' },
  { chain: 'polygon', contract: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', symbol: 'USDC', name: 'USD Coin', decimals: 6, cg: 'usd-coin' },
  { chain: 'arbitrum', contract: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', name: 'USD Coin', decimals: 6, cg: 'usd-coin' },
  { chain: 'base', contract: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', name: 'USD Coin', decimals: 6, cg: 'usd-coin' },
];
