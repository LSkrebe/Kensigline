/** Offline placeholder directory rows for Explore scroll testing. */

export function buildExploreDirectoryMock() {
  const companies = [
    { ticker: 'NVDA', name: 'NVIDIA Corporation', sector: 'Semiconductors', move: '+2.4%', up: true },
    { ticker: 'AMD', name: 'Advanced Micro Devices', sector: 'Semiconductors', move: '-1.1%', up: false },
    { ticker: 'ASML', name: 'ASML Holding', sector: 'Semiconductor equipment', move: '+0.8%', up: true },
    { ticker: 'AVGO', name: 'Broadcom Inc.', sector: 'Semiconductors', move: '+1.6%', up: true },
    { ticker: 'TSM', name: 'Taiwan Semiconductor', sector: 'Semiconductors', move: '-0.4%', up: false },
    { ticker: 'MU', name: 'Micron Technology', sector: 'Memory', move: '+3.2%', up: true },
    { ticker: 'LRCX', name: 'Lam Research', sector: 'Semiconductor equipment', move: '+0.5%', up: true },
    { ticker: 'AMAT', name: 'Applied Materials', sector: 'Semiconductor equipment', move: '-0.9%', up: false },
    { ticker: 'INTC', name: 'Intel Corporation', sector: 'Semiconductors', move: '-2.1%', up: false },
    { ticker: 'QCOM', name: 'Qualcomm', sector: 'Semiconductors', move: '+1.0%', up: true },
    { ticker: 'MRVL', name: 'Marvell Technology', sector: 'Semiconductors', move: '+4.3%', up: true },
    { ticker: 'ON', name: 'ON Semiconductor', sector: 'Semiconductors', move: '-1.8%', up: false },
  ]

  const actors = [
    { name: 'Jensen Huang', mode: 'Insider', ticker: 'NVDA', detail: 'Form 4 · Purchase cluster', amount: '+$5.2M', up: true },
    { name: 'Colette Kress', mode: 'Insider', ticker: 'NVDA', detail: 'Form 4 · Open-market buy', amount: '+$8.1M', up: true },
    { name: 'Lisa Su', mode: 'Insider', ticker: 'AMD', detail: 'Form 4 · Two purchases', amount: '+$1.9M', up: true },
    { name: 'Nancy Pelosi', mode: 'Politician', ticker: 'NVDA', detail: 'PTR · Semiconductor window', amount: '+$2.4M', up: true },
    { name: 'Dan Crenshaw', mode: 'Politician', ticker: 'LRCX', detail: 'PTR · Equipment name', amount: '+$640K', up: true },
    { name: 'Vanguard Group', mode: 'Institution', ticker: 'NVDA', detail: '13F · Top holding add', amount: '+$412M', up: true },
    { name: 'BlackRock', mode: 'Institution', ticker: 'AVGO', detail: '13F · Position decrease', amount: '-$186M', up: false },
    { name: 'Mary Barra', mode: 'Insider', ticker: 'GM', detail: 'Form 4 · Officer purchase', amount: '+$920K', up: true },
    { name: 'Tim Cook', mode: 'Insider', ticker: 'AAPL', detail: 'Form 4 · Routine plan buy', amount: '+$1.1M', up: true },
    { name: 'Josh Gottheimer', mode: 'Politician', ticker: 'MSFT', detail: 'PTR · Tech disclosure', amount: '-$780K', up: false },
  ]

  return { companies, actors }
}
