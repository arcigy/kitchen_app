# FWM Module Contract

Kazdy novy FWM modul musi byt `furnquote-module` balicek s trusted runtime geometriou, BOM, pricing a katalogovymi material/component slotmi.

## System parametre

Modul musi mat tieto parametre: `typeId`, `type`, `displayName`, `family`, `code`, `variant`, `version`, `widthMm`, `heightMm`, `depthMm`, `assemblyContext`, `roomCategory`, `kitchenModuleRole`, `requiresWorktop`, `positionXmm`, `positionYmm`, `positionZmm`, `rotationZDeg`, `customPriceOverride`, `pricingEnabled`, `priceSource`, `costOverride`, `quantity`, `isActive`, `isVisible`, `isLocked`, `isValid`, `validationErrors`, `notes`, `tags`, `createdAt`, `updatedAt`.

`assemblyContext` pouziva existujuci runtime format: `kitchen`, `generic`, `wardrobe`, `bathroom`, `laundry`. Presne zaradenie miestnosti ide do `roomCategory` (`living`, `office`, `reception`, `interior_cladding`, atd.).

Kuchynsky modul musi mat `kitchenModuleRole`: `base`, `top` alebo `tall`. Nekuchynsky modul ma tento parameter pritomny, ale hodnotu moze mat `null`.

## IFC parametre

Povinne IFC parametre: `exportToIfc`, `ifcClass`, `ifcPredefinedType`, `ifcName`, `ifcDescription`, `ifcObjectType`, `ifcTag`, `classificationCode`, `classificationSystem`.

Default pre nabytok je `ifcClass = IfcFurniture`.

## Orientacia stran

Kazdy modul musi definovat:

- `frontSide = FRONT`, `frontDirection = +Z`
- `backSide = BACK`, `backDirection = -Z`
- `leftSide = LEFT`, `leftDirection = -X`
- `rightSide = RIGHT`, `rightDirection = +X`
- `worktopBackSide = BACK`

Root 3D objekt musi mat `userData.orientation` a `userData.worktopPlacement.rotatesWithModule = true`. Meshe maju mat `userData.sideRole`, ked reprezentuju viditelnu stranu alebo panel.

## Materialy

Materialove sloty: `carcass`, `front`, `back`, `shelf`, a pri pracovnej doske alebo stole aj `worktop`.

Materialove skupiny v parametroch: `bodyMaterialGroup`, `frontMaterialGroup`, `backMaterialGroup`, `shelfMaterialGroup`, `worktopMaterialGroup`, `drawerBoxMaterialGroup`.

Kuchynsky modul musi cez kitchen context synchronizovat hrubky a materialy: `boardThickness`, `frontThicknessMm`, `backThickness`, `worktopThicknessMm`, `bodyMaterialId`, `frontMaterialId`, `backMaterialId`, `worktopMaterialId`.

## Test checklist

Pred dokoncenim musia prejst:

- validacia vsetkych FWM balickov
- build 3D geometrie pre kazdy modul
- edge-case normalizacia rozmerov a poctov
- BOM s neprázdnou `materialGroup`
- kitchen context sync po zmene rozmerov a materialov
- typecheck a produkcny build
