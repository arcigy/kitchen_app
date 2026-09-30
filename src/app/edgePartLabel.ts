/** User-facing names; manufacturing identifiers stay stable for persistence. */
export function edgePartLabel(id: string): string {
  const name=id.toLowerCase();
  const side=/left/.test(name)?"ľavá":/right/.test(name)?"pravá":"";
  const index=name.match(/_(\d+)(?:_[xz])?$/)?.[1];
  const suffix=index===undefined?"":` ${Number(index)}`;
  if (/plinth/.test(name)) return /return|side/.test(name)?`Bočný sokel ${side}`.trim():"Predný sokel";
  if (/drawer|cutlery/.test(name)) {
    if (/bottom/.test(name)) return `Dno zásuvky${suffix}`;
    if (/side/.test(name)) return `Bočnica zásuvky ${side}${suffix}`.trim();
    if (/back/.test(name)) return `Chrbát zásuvky${suffix}`;
    return `${/inner/.test(name)?"Vnútorné čelo":"Čelo zásuvky"}${suffix}`;
  }
  if (/door|front_panel|front_right_panel/.test(name)) return `Dvierka${suffix}`;
  if (/shelf/.test(name)) return `Polica${suffix}`;
  if (/rail|support/.test(name)) return `Výstuha ${/back/.test(name)?"zadná":"predná"}${suffix}`;
  if (/side|ending/.test(name)) return `Bočnica ${side}`.trim();
  if (/bottom/.test(name)) return "Dno korpusu";
  if (/top/.test(name)) return "Strop korpusu";
  if (/back|rear/.test(name)) return "Chrbát skrinky";
  return "Panel";
}
