export type BacksplashPurchaseInfo = {
  groupId:string; materialLabel:string; stockLengthMm:number; stockWidthMm:number;
  purchasedPieces:number; purchasedAreaM2:number; netAreaM2:number; cost:number|null; currency:string;
  sheets:Array<{id:string;fraction:1|0.5;lengthMm:number;widthMm:number;placements:Array<{partId:string;xMm:number;yMm:number;lengthMm:number;widthMm:number;rotated:boolean}>}>; error?:string;
};
