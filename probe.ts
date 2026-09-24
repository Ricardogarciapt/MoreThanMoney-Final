import { mapearSimbolo } from './lib/copia-contas/calculo'
console.log('com -VIP:', JSON.stringify(mapearSimbolo('XAUUSD','mt5',{}, ['EURUSD-VIP','XAUUSD-VIP','US30-VIP'])))
console.log('lista vazia:', JSON.stringify(mapearSimbolo('XAUUSD','mt5',{}, [])))
console.log('null:', JSON.stringify(mapearSimbolo('XAUUSD','mt5',{}, null)))
