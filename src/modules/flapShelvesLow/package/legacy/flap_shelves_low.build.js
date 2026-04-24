function flapShelfBuildV2(n) {
	const e = new St();
	e.name = "flapShelvesLowModule";
	const width = Math.max(200, Number(n.width) || 800) * Wt;
	const height = Math.max(200, Number(n.height) || 720) * Wt;
	const depth = Math.max(200, Number(n.depth) || 560) * Wt;
	const boardThickness = Math.max(.005, Number(n.boardThickness || 18) * Wt);
	const frontThickness = Math.max(.005, Number(n.frontThicknessMm && Number.isFinite(Number(n.frontThicknessMm)) ? n.frontThicknessMm : n.boardThickness || 18) * Wt);
	const backThickness = Math.max(.003, Number(n.backThickness || 8) * Wt);
	const plinthHeight = Math.max(0, Number(n.plinthHeight || 0)) * Wt;
	const plinthSetback = Math.max(0, Number(n.plinthSetbackMm || 0)) * Wt;
	const shelfThickness = Math.max(.005, Number(n.shelfThickness || n.boardThickness || 18) * Wt);
	const sideGap = Math.max(0, Number(n.sideGap || 0)) * Wt;
	const topGap = Math.max(0, Number(n.topGap || 0)) * Wt;
	const bottomGap = Math.max(0, Number(n.bottomGap || 0)) * Wt;
	const wallMounted = n.wallMounted === !0;
	const doorSystem = n.doorSystem === "double_hinged" ? "double_hinged" : "flap_up";
	const doorOpen = n.doorOpen === !0 || n.flapOpen === !0;
	const bodyMaterial = new Xe({
		color: Jl(n.materials?.bodyColor),
		roughness: .85,
		metalness: 0
	});
	const frontMaterial = new Xe({
		color: Jl(n.materials?.frontColor),
		roughness: .65,
		metalness: 0
	});
	const hardwareMaterial = new Xe({
		color: 4869978,
		roughness: .5,
		metalness: .15
	});
	const resolveHandleMaterial = () => {
		const componentId = typeof n.handleComponentId === "string" && n.handleComponentId.trim().length > 0 ? n.handleComponentId.trim() : "";
		if (componentId.includes(".white")) {
			return new Xe({
				color: 15856107,
				roughness: .62,
				metalness: .08
			});
		};
		if (componentId.includes(".inox") || componentId.includes(".aluminium") || componentId.includes(".aluminum")) {
			return new Xe({
				color: 12962255,
				roughness: .32,
				metalness: .82
			});
		};
		return new Xe({
			color: 1711394,
			roughness: .46,
			metalness: .34
		});
	};
	const handleMaterial = resolveHandleMaterial();
	const resolvedHandleLength = Math.max(.03, Number(n.handleLengthMm || 160) * Wt);
	const resolvedHandleSize = Math.max(.008, Number(n.handleSizeMm || 12) * Wt);
	const resolvedHandleProjection = Math.max(.008, Number(n.handleProjectionMm || 14) * Wt);
	const handleProjection = resolvedHandleProjection;
	const defaultHandlePositionMm = doorSystem === "double_hinged" ? 100 : 60;
	const resolvedHandleOffsetFromBottom = Math.max(0, Number(n.handlePositionMm || defaultHandlePositionMm)) * Wt;
	const resolvedHandleOffsetFromSplit = Math.max(0, Number(n.handleHorizontalPositionMm ?? n.doorHandleOffsetFromSplitMm ?? 0) || 0) * Wt;
	const hingeComponentId = typeof n.hingeComponentId === "string" && n.hingeComponentId.trim().length > 0 ? n.hingeComponentId.trim() : "cmp.hinge.clip_on.softclose";
	const resolveHandleOffsetFromTop = (doorHeight) => Math.max(resolvedHandleSize / 2, Math.min(doorHeight - resolvedHandleSize / 2, doorHeight - resolvedHandleOffsetFromBottom));
	const resolveHingeVisualSpec = () => {
		if (hingeComponentId.includes(".wide_angle.155.")) {
			return {
				width: .022,
				height: .032,
				depth: .015,
				offsetX: .011,
				offsetZ: .009,
				angleY: .18,
				plateWidth: .018
			};
		};
		if (hingeComponentId.includes(".corner.45.")) {
			return {
				width: .018,
				height: .03,
				depth: .014,
				offsetX: .009,
				offsetZ: .008,
				angleY: .42,
				plateWidth: .015
			};
		};
		if (hingeComponentId.includes(".standard")) {
			return {
				width: .012,
				height: .024,
				depth: .01,
				offsetX: .006,
				offsetZ: .006,
				angleY: 0,
				plateWidth: .012
			};
		};
		return {
			width: .014,
			height: .028,
			depth: .012,
			offsetX: .007,
			offsetZ: .007,
			angleY: 0,
			plateWidth: .013
		};
	};
	const markBoard = (mesh, dimensionsMm, paramKeys) => {
		mesh.userData.selectable = !0;
		mesh.userData.dimensionsMm = {
			width: dimensionsMm.width,
			height: dimensionsMm.height,
			depth: dimensionsMm.depth
		};
		mesh.userData.paramKeys = [...paramKeys];
	};
	const addBox = (name, geometry, material, position, dimensionsMm, paramKeys) => {
		const mesh = new oe(geometry, material);
		mesh.name = name;
		mesh.position.copy(position);
		markBoard(mesh, dimensionsMm, paramKeys);
		e.add(mesh);
		return mesh;
	};
	const addHandleToPivot = (pivot, args) => {
		if (n.handleType === "none" || !(typeof n.handleComponentId === "string" && n.handleComponentId.length > 0)) {
			return;
		};
		const offsetFromTop = Math.max(resolvedHandleSize / 2, Math.min(args.doorHeight - resolvedHandleSize / 2, args.offsetFromTop ?? resolveHandleOffsetFromTop(args.doorHeight)));
		const z = frontThickness / 2 + resolvedHandleProjection / 2 + .001;
		if (n.handleType === "knob") {
			const knobRadius = Math.max(.006, resolvedHandleSize / 2);
			const knobDepth = Math.max(.008, resolvedHandleProjection);
			const knob = new oe(new wt(knobRadius, knobRadius, knobDepth, 18), handleMaterial);
			knob.name = args.name;
			knob.rotation.x = Math.PI / 2;
			knob.position.set(args.x, -offsetFromTop, z);
			markBoard(knob, {
				width: knobRadius * 2 / Wt,
				height: knobRadius * 2 / Wt,
				depth: knobDepth / Wt
			}, [
				"handleComponentId",
				"handleType",
				"handlePositionMm",
				"handleSizeMm",
				"handleProjectionMm"
			]);
			knob.userData.catalogComponentId = n.handleComponentId;
			pivot.add(knob);
			return;
		};
		const vertical = args.orientation === "vertical";
		const handleWidth = vertical ? resolvedHandleSize : Math.min(resolvedHandleLength, args.doorWidth * .72);
		const handleHeight = vertical ? Math.min(resolvedHandleLength, args.doorHeight * .72) : resolvedHandleSize;
		const handle = new oe(new Se(handleWidth, handleHeight, resolvedHandleProjection), handleMaterial);
		handle.name = args.name;
		handle.position.set(args.x, -offsetFromTop, z);
		markBoard(handle, {
			width: handleWidth / Wt,
			height: handleHeight / Wt,
			depth: resolvedHandleProjection / Wt
		}, [
			"handleComponentId",
			"handleType",
			"handlePositionMm",
			"handleHorizontalPositionMm",
			"doorHandleOffsetFromSplitMm",
			"handleLengthMm",
			"handleSizeMm",
			"handleProjectionMm"
		]);
		handle.userData.catalogComponentId = n.handleComponentId;
		pivot.add(handle);
	};
	const plinthDepth = Math.min(boardThickness, depth * .2);
	const plinthCenterZ = depth / 2 - plinthDepth / 2 - Math.min(plinthSetback, depth / 2);
	const innerHeight = height - plinthHeight;
	const panelGeometry = new Se(boardThickness, innerHeight, depth);
	addBox("leftSide", panelGeometry, bodyMaterial, new ne(-(width / 2 - boardThickness / 2), plinthHeight + innerHeight / 2, 0), {
		width: boardThickness / Wt,
		height: innerHeight / Wt,
		depth: depth / Wt
	}, [
		"width",
		"height",
		"depth",
		"boardThickness",
		"plinthHeight",
		"wallMounted"
	]);
	addBox("rightSide", panelGeometry, bodyMaterial, new ne(width / 2 - boardThickness / 2, plinthHeight + innerHeight / 2, 0), {
		width: boardThickness / Wt,
		height: innerHeight / Wt,
		depth: depth / Wt
	}, [
		"width",
		"height",
		"depth",
		"boardThickness",
		"plinthHeight",
		"wallMounted"
	]);
	const clearWidth = width - boardThickness * 2;
	addBox("bottom", new Se(clearWidth, boardThickness, depth), bodyMaterial, new ne(0, plinthHeight + boardThickness / 2, 0), {
		width: clearWidth / Wt,
		height: boardThickness / Wt,
		depth: depth / Wt
	}, [
		"width",
		"depth",
		"boardThickness",
		"plinthHeight",
		"wallMounted"
	]);
	addBox("top", new Se(clearWidth, boardThickness, depth), bodyMaterial, new ne(0, height - boardThickness / 2, 0), {
		width: clearWidth / Wt,
		height: boardThickness / Wt,
		depth: depth / Wt
	}, [
		"width",
		"depth",
		"height",
		"boardThickness"
	]);
	addBox("back", new Se(width, innerHeight, backThickness), bodyMaterial, new ne(0, plinthHeight + innerHeight / 2, -depth / 2 - backThickness / 2), {
		width: width / Wt,
		height: innerHeight / Wt,
		depth: backThickness / Wt
	}, [
		"width",
		"height",
		"depth",
		"backThickness",
		"plinthHeight",
		"wallMounted"
	]);
	if (!wallMounted && plinthHeight > 0) {
		addBox("kick", new Se(width, plinthHeight, plinthDepth), bodyMaterial, new ne(0, plinthHeight / 2, plinthCenterZ), {
			width: width / Wt,
			height: plinthHeight / Wt,
			depth: plinthDepth / Wt
		}, [
			"width",
			"plinthHeight",
			"plinthSetbackMm",
			"depth",
			"boardThickness",
			"wallMounted"
		]);
	};
	const shelfCount = Math.max(1, Math.round(Number(n.shelfCount) || 1));
	const shelfSlots = Math.max(0, shelfCount - 1);
	const shelfBaseY = plinthHeight + boardThickness;
	const shelfGaps = n.shelfAutoFit === !0 ? Gn({
		...n,
		shelfGaps: []
	}) : Gn(n);
	for (let index = 0; index < shelfSlots; index += 1) {
		const gapMm = shelfGaps[index] ?? 0;
		const shelfY = shelfBaseY + gapMm * Wt;
		addBox(`shelf_${index + 1}`, new Se(clearWidth, shelfThickness, depth), bodyMaterial, new ne(0, shelfY, 0), {
			width: clearWidth / Wt,
			height: shelfThickness / Wt,
			depth: depth / Wt
		}, [
			"shelfCount",
			"shelfThickness",
			"shelfAutoFit",
			"shelfGaps",
			"height",
			"plinthHeight",
			"boardThickness"
		]);
	};
	const frontWidth = Math.max(.05, width - 2 * sideGap);
	const frontHeight = Math.max(.1, innerHeight - topGap - bottomGap);
	const frontPivotY = plinthHeight + innerHeight - topGap;
	const frontPlaneZ = depth / 2 + frontThickness / 2;
	if (doorSystem === "double_hinged") {
		const centerGap = Math.max(.002, Math.min(sideGap, frontWidth * .05));
		const leafWidth = Math.max(.05, (frontWidth - centerGap) / 2);
		const openAngle = doorOpen ? Math.PI / 2 : 0;
		const addDoubleDoor = (leafName, side) => {
			const pivot = new St();
			pivot.name = `${leafName}_pivot`;
			const pivotX = side === "left" ? -frontWidth / 2 : frontWidth / 2;
			pivot.position.set(pivotX, frontPivotY, frontPlaneZ);
			pivot.rotation.y = side === "left" ? -openAngle : openAngle;
			const door = new oe(new Se(leafWidth, frontHeight, frontThickness), frontMaterial);
			door.name = leafName;
			door.position.set(side === "left" ? leafWidth / 2 : -leafWidth / 2, -frontHeight / 2, 0);
			markBoard(door, {
				width: leafWidth / Wt,
				height: frontHeight / Wt,
				depth: frontThickness / Wt
			}, [
				"doorSystem",
				"doorOpen",
				"width",
				"height",
				"sideGap",
				"topGap",
				"bottomGap",
				"frontThicknessMm",
				"hingeComponentId"
			]);
			pivot.add(door);
			const handleInsetFromSplit = Math.max(resolvedHandleSize / 2 + .012, Math.min(leafWidth - resolvedHandleSize / 2 - .012, resolvedHandleSize / 2 + .012 + resolvedHandleOffsetFromSplit));
			addHandleToPivot(pivot, {
				name: `${leafName}_handle`,
				x: side === "left" ? leafWidth - handleInsetFromSplit : -leafWidth + handleInsetFromSplit,
				doorWidth: leafWidth,
				doorHeight: frontHeight,
				orientation: "vertical",
				offsetFromTop: resolveHandleOffsetFromTop(frontHeight)
			});
			const hingeCount = Math.max(2, H0(n.hingeCountPerDoor ?? n.hingeCount, 2, 6));
			const hingeInsetY = .06;
			const hingeSpan = Math.max(0, frontHeight - hingeInsetY * 2);
			const hingeVisual = resolveHingeVisualSpec();
			for (let idx = 0; idx < hingeCount; idx += 1) {
				const ratio = hingeCount === 1 ? .5 : idx / (hingeCount - 1);
				const hinge = new oe(new Se(hingeVisual.width, hingeVisual.height, hingeVisual.depth), hardwareMaterial);
				hinge.name = `${leafName}_hinge_${idx + 1}`;
				hinge.position.set(side === "left" ? hingeVisual.offsetX : -hingeVisual.offsetX, -frontHeight + hingeInsetY + ratio * hingeSpan, -frontThickness / 2 - hingeVisual.offsetZ);
				hinge.rotation.y = side === "left" ? hingeVisual.angleY : -hingeVisual.angleY;
				markBoard(hinge, {
					width: hingeVisual.width / Wt,
					height: hingeVisual.height / Wt,
					depth: hingeVisual.depth / Wt
				}, [
					"doorSystem",
					"doorOpen",
					"hingeComponentId"
				]);
				pivot.add(hinge);
				if (hingeVisual.plateWidth > 0) {
					const plate = new oe(new Se(hingeVisual.plateWidth, hingeVisual.height * .72, .0035), hardwareMaterial);
					plate.name = `${leafName}_hinge_plate_${idx + 1}`;
					plate.position.set(side === "left" ? hingeVisual.offsetX + hingeVisual.plateWidth * .5 : -hingeVisual.offsetX - hingeVisual.plateWidth * .5, -frontHeight + hingeInsetY + ratio * hingeSpan, -frontThickness / 2 - .002);
					plate.rotation.y = hinge.rotation.y * .35;
					markBoard(plate, {
						width: hingeVisual.plateWidth / Wt,
						height: hingeVisual.height * .72 / Wt,
						depth: 3.5
					}, [
						"doorSystem",
						"doorOpen",
						"hingeComponentId"
					]);
					pivot.add(plate);
				}
			};
			e.add(pivot);
		};
		addDoubleDoor("door_left", "left");
		addDoubleDoor("door_right", "right");
		return e;
	};
	const flapPivot = new St();
	flapPivot.name = "flap_pivot";
	flapPivot.position.set(0, frontPivotY, frontPlaneZ);
	flapPivot.rotation.x = doorOpen ? -Math.PI / 2 : 0;
	const flap = new oe(new Se(frontWidth, frontHeight, frontThickness), frontMaterial);
	flap.name = "flap";
	flap.position.set(0, -frontHeight / 2, 0);
	markBoard(flap, {
		width: frontWidth / Wt,
		height: frontHeight / Wt,
		depth: frontThickness / Wt
	}, [
		"doorSystem",
		"doorOpen",
		"width",
		"height",
		"sideGap",
		"topGap",
		"bottomGap",
		"frontThicknessMm",
		"liftUpComponentId"
	]);
	flapPivot.add(flap);
	addHandleToPivot(flapPivot, {
		name: "flap_handle",
		x: 0,
		doorWidth: frontWidth,
		doorHeight: frontHeight,
		orientation: "horizontal",
		offsetFromTop: resolveHandleOffsetFromTop(frontHeight)
	});
	const hingeCount = H0(n.hingeCount, 1, 5);
	const hingeInsetFromSide = Math.max(0, Number(n.hingeInsetFromSideMm || 0)) * Wt;
	const hingeReach = Math.max(0, frontWidth / 2 - .015 - hingeInsetFromSide);
	for (const [idx, offsetX] of (hingeCount === 1 ? [0] : Array.from({ length: hingeCount }, (_, index) => {
		const ratio = hingeCount === 1 ? .5 : index / (hingeCount - 1);
		return -hingeReach + ratio * (hingeReach * 2);
	})).entries()) {
		const hinge = new oe(new Se(.03, .01, .02), hardwareMaterial);
		hinge.name = `hinge_${idx + 1}`;
		hinge.position.set(offsetX, -.005, -frontThickness / 2 - .011);
		markBoard(hinge, {
			width: 30,
			height: 10,
			depth: 20
		}, [
			"doorSystem",
			"doorOpen",
			"liftUpComponentId"
		]);
		flapPivot.add(hinge);
	};
	e.add(flapPivot);
	return e;
}