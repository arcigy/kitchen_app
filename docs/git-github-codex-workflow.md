# AGENTS.md — Git, GitHub a Codex workflow pre FurnQuote / RCG aplikáciu

Tento súbor je záväzný pracovný návod pre oboch vývojárov aj pre Codex.

Cieľ je jednoduchý:

- nikto nestratí prácu,
- `main` ostáva stabilný,
- `develop` je pracovná integračná vetva,
- každá úloha ide cez vlastnú branchu,
- každá zmena ide cez Pull Request,
- Codex nerobí nečakané push/stage/branch operácie,
- klientské dáta, secrety, storage a `.fqp` súbory sa nikdy nedostanú do Gitu.

---

## 1. Základný branch model

Používame tento model:

```txt
main        = stabilná/release verzia
develop     = pracovná integračná verzia
feature/*   = nové funkcie
fix/*       = opravy bugov
release/*   = príprava verzie pre klienta
hotfix/*    = urgentné opravy main
```

### `main`

`main` je stabilná vetva.

Do `main` ide iba kód, ktorý:

- prešiel cez PR,
- prešiel CI,
- prešiel kontrolou,
- je použiteľný pre klienta,
- neobsahuje rozrobený experiment.

Nikto nesmie pushovať priamo do `main`.

### `develop`

`develop` je pracovná integračná vetva.

Do `develop` sa mergujú hotové feature/fix branche cez PR.

Nikto by nemal robiť priamo na `develop`, okrem výnimočnej údržby po dohode.

### `feature/*`

Na každú novú funkciu vytvárame samostatnú branchu:

```txt
feature/project-autosave
feature/backup-snapshots
feature/project-phases
feature/catalog-admin-ui
feature/kitchen-logic-fixes
```

### `fix/*`

Na opravy bugov:

```txt
fix/fqp-import-conflict
fix/catalog-material-fallback
fix/project-load-doors
```

### `release/*`

Na prípravu verzie pre klienta:

```txt
release/2026-06-client-demo
release/2026-06-production-v1
```

Do release branch nejdú veľké nové funkcie. Iba bugfixy, testy, stabilizácia, drobné UI úpravy.

### `hotfix/*`

Na urgentnú opravu stabilnej verzie:

```txt
hotfix/login-session-expiry
hotfix/fqp-download-fail
```

---

## 2. Clone vs pull

### `git clone`

`clone` sa robí iba raz, keď vývojár ešte nemá projekt v počítači.

```bash
git clone <REPOSITORY_URL>
cd kitchen_app
git checkout develop
npm ci
```

Neklonovať projekt stále nanovo.

Zlé:

```txt
kitchen_app
kitchen_app_2
kitchen_app_final
kitchen_app_final_real
```

Správne:

```txt
jeden lokálny priečinok projektu
```

### `git pull`

`pull` sa používa, keď už projekt existuje lokálne a vývojár chce najnovšie zmeny z GitHubu.

Na `develop` používame:

```bash
git checkout develop
git pull --ff-only origin develop
```

`--ff-only` je bezpečnejšie, lebo Git odmietne vytvoriť nečakaný merge commit na `develop`.

---

## 3. Denný workflow pre vývojára

### Keď začínam novú úlohu

```bash
git checkout develop
git pull --ff-only origin develop
git checkout -b feature/nazov-ulohy
```

Príklad:

```bash
git checkout develop
git pull --ff-only origin develop
git checkout -b feature/autosave-snapshots
```

Potom pracujem iba na tejto feature branchi.

### Počas práce

Robím menšie commity:

```bash
git status
git add -A
git commit -m "feat(save): add autosave snapshot service"
```

Na konci dňa pushnem branchu:

```bash
git push -u origin feature/autosave-snapshots
```

### Keď chcem pokračovať na existujúcej feature branchi

```bash
git fetch origin
git checkout feature/autosave-snapshots
git merge origin/develop
```

Tým si do svojej rozrobenej branch doplním najnovšie zmeny z `develop`.

Ak chcem radšej rebase a viem, čo robím:

```bash
git fetch origin
git checkout feature/autosave-snapshots
git rebase origin/develop
```

Pre tento tím je default odporúčanie `merge origin/develop`, lebo je jednoduchšie a bezpečnejšie pre menej skúsený tím.

---

## 4. Čo spraviť pred každým pull/merge

Pred každým pullom alebo mergom:

```bash
git status
```

Ak vidím:

```txt
nothing to commit, working tree clean
```

môžem pokračovať.

Ak mám lokálne zmeny, mám dve možnosti.

### Možnosť A: commitnúť rozrobenú prácu

```bash
git add -A
git commit -m "wip: continue project phases UI"
```

Potom môžem syncnúť:

```bash
git fetch origin
git merge origin/develop
```

### Možnosť B: stashnúť rozrobenú prácu

Použiť, keď ešte nechcem commit:

```bash
git stash push -u -m "wip before syncing develop"
git checkout develop
git pull --ff-only origin develop
git checkout feature/nazov-ulohy
git merge origin/develop
git stash pop
```

`stash` dočasne odloží lokálne zmeny bokom.

---

## 5. Ako sa spájajú zmeny dvoch vývojárov

Príklad:

Vývojár A dokončí:

```txt
feature/fqp-project-format
```

a cez PR to mergne do:

```txt
develop
```

Vývojár B má rozrobené:

```txt
feature/autosave-snapshots
```

Vývojár B si doplní nové zmeny z `develop` takto:

```bash
git fetch origin
git checkout feature/autosave-snapshots
git merge origin/develop
```

Teraz branch B obsahuje:

```txt
jeho rozrobený autosave
+
nové zmeny z developu
```

Ak vznikne conflict, Git nič nezmaže automaticky. Vývojár musí conflict vyriešiť ručne.

---

## 6. Conflict pravidlá

Conflict vznikne, keď dvaja ľudia zmenili rovnakú časť rovnakého súboru.

Git ukáže napríklad:

```txt
&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD
moja verzia
&#61;&#61;&#61;&#61;&#61;&#61;&#61;
verzia z developu
&gt;&gt;&gt;&gt;&gt;&gt;&gt; origin/develop
```

Postup:

```bash
git status
```

Otvoriť konfliktné súbory.

Ručne rozhodnúť, čo má ostať.

Potom:

```bash
git add -A
git commit -m "fix: resolve merge conflict with develop"
```

Nikdy nepoužívať:

```bash
git reset --hard
```

ak si nie ste úplne istí, čo robíte. Môže zmazať lokálne zmeny.

---

## 7. Pull Request workflow

Každá feature/fix branch ide cez Pull Request:

```txt
feature/nazov-ulohy → develop
fix/nazov-opravy → develop
release/* → main
hotfix/* → main aj develop
```

PR musí obsahovať:

```txt
Čo sa zmenilo
Prečo sa to menilo
Ako bolo testované
Riziká / čo ostáva
```

Pred PR musia lokálne prejsť minimálne:

```bash
npm run typecheck
npm test
npm run build
```

Ak sa mení UI alebo editor správanie, spustiť aj:

```bash
npm run test:ui-regression
```

---

## 8. Commit message pravidlá

Používame jednoduchý Conventional Commit štýl.

Formát:

```txt
type(scope): krátky popis
```

Typy:

```txt
feat      = nová funkcia
fix       = oprava bugu
chore     = údržba
test      = testy
docs      = dokumentácia
refactor  = refaktor bez zmeny správania
perf      = výkon
style     = formátovanie bez zmeny logiky
```

Príklady:

```bash
git commit -m "feat(project): add encrypted fqp export"
git commit -m "fix(catalog): prevent disabled modules in kitchen topbar"
git commit -m "test(project): add multiphase asset bundling coverage"
git commit -m "docs(save): document fqp asset restore rules"
```

Zlé commit messages:

```txt
update
fix
changes
new stuff
asdf
final
```

---

## 9. Branch naming pravidlá

Používame malé písmená, pomlčky a jasný názov.

Správne:

```txt
feature/101-autosave-snapshots
feature/project-phases
fix/fqp-import-conflict
docs/git-workflow
release/2026-06-client-demo
hotfix/session-cookie-expiry
```

Zlé:

```txt
new
final
andrej
test
branch2
super-update
```

Ak je k úlohe GitHub Issue, branch názov začína číslom issue:

```txt
feature/101-autosave-snapshots
fix/118-project-load-conflict
```

---

## 10. GitHub branch protection

Na GitHube treba chrániť minimálne:

```txt
main
develop
```

### `main` protection

Zapnúť:

```txt
Require a pull request before merging
Require status checks to pass before merging
Require branches to be up to date before merging
Block force pushes
Restrict deletions
Do not allow bypassing the above settings
```

### `develop` protection

Zapnúť:

```txt
Require a pull request before merging
Require status checks to pass before merging
Block force pushes
Restrict deletions
```

Do `main` a `develop` sa nesmie pushovať priamo.

---

## 11. CI pravidlá

CI musí bežať na:

```txt
pull_request do main/develop
push do main/develop
```

Minimálne kroky:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

UI regression môže byť buď povinná, alebo manuálna podľa rýchlosti. Ak sa mení UI/editor, musí sa spustiť.

Odporúčaný workflow súbor:

```txt
.github/workflows/ci.yml
```

Obsah:

```yaml
name: CI

on:
  pull_request:
    branches:
      - main
      - develop
  push:
    branches:
      - main
      - develop

jobs:
  checks:
    name: typecheck-test-build
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Tests
        run: npm test

      - name: Build
        run: npm run build
```

---

## 12. Pull Request template

Odporúčaný súbor:

```txt
.github/pull_request_template.md
```

Obsah:

```md
## Čo sa zmenilo

-

## Prečo

-

## Ako bolo testované

- [ ] npm run typecheck
- [ ] npm test
- [ ] npm run build
- [ ] npm run test:ui-regression
- [ ] manuálny browser smoke test

## Riziká / čo ostáva

-

## Checklist

- [ ] Nepushoval som priamo do main/develop
- [ ] Žiadne secrety v kóde
- [ ] Žiadne klientské dáta v Gite
- [ ] Žiadne storage/output/export súbory v Gite
- [ ] Žiadne .fqp súbory v Gite
- [ ] Ak som menil save/load, pridal som roundtrip test
- [ ] Ak som menil tenant/client logiku, overil som client isolation
```

---

## 13. `.gitignore` pravidlá

Tieto veci nesmú byť v Gite:

```gitignore
node_modules/
dist/
build/

.env
.env.*
!.env.example

storage/
outputs/
exports/
tmp/
temp/

*.fqp
*.kitchenproj

coverage/
playwright-report/
test-results/

*.log

.DS_Store
Thumbs.db
```

Ak Git už trackuje niektoré z týchto súborov, odstrániť ich iba z indexu, nie z disku:

```bash
git rm -r --cached storage
git rm -r --cached outputs
git rm -r --cached exports
git rm --cached .env
git rm --cached "*.fqp"
git commit -m "chore: stop tracking local/generated files"
```

Ak bol secret niekedy pushnutý na GitHub, treba ho vymeniť. Nestačí ho zmazať z repozitára.

---

## 14. Environment premenné

Reálne secrety nepatria do Gitu.

Povolený je iba `.env.example`.

Príklad:

```env
AUTH_SESSION_SECRET=
PROJECT_FILE_SECRET=
PROJECT_FILE_KEY_ID=
PROJECT_FILE_MAX_SINGLE_ASSET_MB=25
PROJECT_FILE_MAX_TOTAL_ASSET_MB=150
PROJECT_FILE_MAX_ASSET_COUNT=200
ALLOW_LEGACY_PROJECT_READ=false
ALLOW_TENANT_STORAGE_MIGRATION=false
```

Každý vývojár má vlastný lokálny `.env`.

---

## 15. Pravidlá pre Codex

Codex musí dodržiavať tieto pravidlá.

### Codex nesmie robiť bez explicitného pokynu

Codex nesmie automaticky:

```txt
git push
git pull
git commit
git add
git reset --hard
git clean -fd
git checkout main
git checkout develop
vytvoriť branch
zmazať branch
meniť .env
mazať storage dáta
mazať klientské súbory
mazať outputs/exports bez explicitného pokynu
```

Codex môže navrhnúť príkazy, ale nesmie ich vykonať, ak používateľ výslovne nepovie, že má.

### Aktívna výnimka zakladateľa: okamžitá online viditeľnosť

Zakladateľ výslovne požaduje, aby každá samostatná a overená zmena bola po
testoch hneď commitnutá a pushnutá na svoju pracovnú branch. Táto výnimka
platí pre commit a push pracovnej branche; neplatí pre priamy push do `main`
ani `develop`, pre neoverené zmeny, cudzie rozpracované súbory, secrety alebo
klientske dáta.

### Codex pred prácou

Codex má najprv zistiť stav:

```bash
git status
git branch --show-current
```

Ak je pracovný strom špinavý, Codex musí upozorniť, ktoré súbory sú zmenené, a nesmie ich bezhlavo prepísať.

### Codex počas práce

Codex musí:

- meniť iba súbory v scope úlohy,
- nezasahovať do nesúvisiacich častí,
- nevytvárať veľké refaktory bez potreby,
- nepridávať nové features mimo zadania,
- chrániť tenant isolation,
- chrániť `ClientContext`,
- chrániť `ClientCatalog`,
- chrániť `.fqp` save/load integritu,
- chrániť server-side encryption boundary.

### Codex po práci

Codex musí spustiť podľa scope:

```bash
npm run typecheck
npm test
npm run build
```

Ak sa mení UI/editor flow:

```bash
npm run test:ui-regression
```

Codex musí na konci vypísať:

```txt
1. čo bolo zmenené
2. ktoré súbory boli zmenené
3. čo bolo testované
4. výsledky testov
5. čo ostáva
6. či niečo zlyhalo
7. či nepushoval/necommitoval/nestageoval
```

---

## 16. Pravidlá pre citlivé oblasti projektu

Tieto oblasti sú kritické.

### Auth/login

Pri zmenách auth musí platiť:

```txt
clientId je zo server session
frontend nevytvára autoritatívnu session
cookie je podpísaná/server-issued
session expiry funguje
fake/expired session testy prechádzajú
```

### Tenant storage

Pri zmenách storage musí platiť:

```txt
žiadne globálne exports/
žiadne cross-client read/write
všetko cez storage resolver/service
projectId/phaseId ownership validácia
```

### ClientCatalog

Pri zmenách catalogu musí platiť:

```txt
UI/BOM/runtime/rendering používajú ClientCatalog
žiadny runtime fallback na getSystemSeedCatalog()
žiadne priame runtime importy zo src/data/pricing/materials/hardware
```

### Project save / `.fqp`

Pri zmenách save/load musí platiť:

```txt
ProjectSaveFile je validovaný
saveFormatVersion funguje
roundtrip test prechádza
.fqp je encrypted server-side
PROJECT_FILE_SECRET nie je vo frontende
multi-phase uploads sa bundlujú
import neprepíše existujúci projekt pri konflikte
foreign clientId zlyhá
```

---

## 17. Release workflow

Keď ideme pripraviť verziu pre klienta:

```bash
git checkout develop
git pull --ff-only origin develop
git checkout -b release/2026-06-client-demo
git push -u origin release/2026-06-client-demo
```

Na release branch povoľujeme iba:

```txt
bugfixy
stabilizáciu
testy
dokumentáciu
drobné UI polish zmeny
```

Keď je release pripravený:

```txt
release/* → main
release/* → develop
```

Potom tag:

```bash
git checkout main
git pull --ff-only origin main
git tag v0.1.0-client-demo
git push origin v0.1.0-client-demo
```

---

## 18. Hotfix workflow

Ak je produkcia/main pokazená:

```bash
git checkout main
git pull --ff-only origin main
git checkout -b hotfix/nazov-opravy
```

Po oprave:

```txt
hotfix/* → main
hotfix/* → develop
```

Hotfix musí prejsť CI.

---

## 19. Čo nikdy nerobiť

Nikdy nerobiť:

```bash
git push origin main
git push origin develop
git reset --hard
git clean -fd
git pull
```

naslepo.

Najprv vždy:

```bash
git status
git branch --show-current
```

Neklonovať repo opakovane do nových priečinkov namiesto používania pull/fetch.

Nepoužívať commity typu:

```txt
update
fix
changes
final
```

Nepushovať:

```txt
.env
storage/
outputs/
exports/
*.fqp
klientské dáta
```

---

## 20. Rýchle command checklisty

### Nová úloha

```bash
git checkout develop
git pull --ff-only origin develop
git checkout -b feature/nazov-ulohy
```

### Pokračovanie v rozrobenej branchi

```bash
git fetch origin
git checkout feature/nazov-ulohy
git merge origin/develop
```

### Uloženie práce

```bash
git status
git add -A
git commit -m "feat(scope): clear description"
git push -u origin feature/nazov-ulohy
```

### Pred PR

```bash
npm run typecheck
npm test
npm run build
npm run test:ui-regression
```

### Keď mám lokálne zmeny a potrebujem update

```bash
git stash push -u -m "wip before sync"
git checkout develop
git pull --ff-only origin develop
git checkout feature/nazov-ulohy
git merge origin/develop
git stash pop
```

### Keď vznikne conflict

```bash
git status
# vyriešiť súbory ručne
git add -A
git commit -m "fix: resolve merge conflict"
```

---

## 21. Definícia hotovej úlohy

Úloha je hotová iba ak:

```txt
kód je v správnej feature/fix branchi
testy prešli
build prešiel
PR je vytvorený
PR je skontrolovaný
CI prešlo
merge ide do develop cez PR
žiadne secrety ani klientské dáta nie sú v Gite
```

Ak ide o release:

```txt
release branch prešla testami
release branch bola mergnutá do main
release branch bola mergnutá späť do develop
tag bol vytvorený
```

---

## 22. Aktuálne najdôležitejšie pravidlo

Pre tento projekt je najväčšie riziko chaos v branchiach a neúmyselné prepísanie práce.

Preto platí:

```txt
Clone iba raz.
Pull pravidelne.
Každá úloha má vlastnú branchu.
Pred pull/merge vždy git status.
Do main/develop iba cez PR.
Codex nesmie pushovať/commitovať/stageovať bez výslovného pokynu.
```
