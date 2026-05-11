// Этот файл потом легко заменим на реальные axios/fetch запросы к вашему Go API
export const fetchMarketData = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { id: 1, ticker: 'SBER', name: 'Сбербанк', price: 265.10, change: 5.83, isUp: true },
        { id: 2, ticker: 'GAZP', name: 'Газпром', price: 170.80, change: -1.26, isUp: false },
        { id: 3, ticker: 'YNDX', name: 'Яндекс', price: 2888.00, change: 4.2, isUp: true },
      ]);
    }, 800); // Имитация задержки сети
  });
};