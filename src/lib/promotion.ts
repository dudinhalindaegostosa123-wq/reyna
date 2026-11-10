/** Percentage for a real, available promotional price; never infer it from a price adjustment. */
export function promotionPercent(price:number,originalPrice?:number,available=true):number|null {
 if(!available || !Number.isFinite(price) || !Number.isFinite(originalPrice) || originalPrice === undefined || originalPrice<=0 || price<0 || price>=originalPrice)return null
 // Round down to one decimal so the badge never promises a larger discount.
 const percent=Math.floor(((originalPrice-price)/originalPrice)*1000+1e-8)/10
 return percent>0?percent:null
}
