// ****************************************************************************
//
// Copyright (C) 2008-2014, Roman Lygin. All rights reserved.
// Copyright (C) 2014-2022, CADEX. All rights reserved.
//
// This file is part of the CAD Exchanger software.
//
// You may use this file under the terms of the BSD license as follows:
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
// * Redistributions of source code must retain the above copyright notice,
//   this list of conditions and the following disclaimer.
// * Redistributions in binary form must reproduce the above copyright notice,
//   this list of conditions and the following disclaimer in the documentation
//   and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.
//
// ****************************************************************************

import { fetchFile, initModelSelector, modelUrl, updateSceneSmoothly } from '../assets/js/helpers.mjs';

import cadex from '@cadexchanger/web-toolkit';

/**
 * @enum {string}
 */
let CliPlaneAxis = {
  x: 'x',
  y: 'y',
  z: 'z',
};

class ClipPlane extends cadex.ModelPrs_ClipPlane {
  /**
   * @param {cadex.ModelData_Box} theBBox
   * @param {CliPlaneAxis} theAxis
   */
  constructor(theBBox, theAxis) {
    // create default plane, the position and direction will be updated later
    const aPlane = cadex.ModelData_Plane.fromPointAndNormal(new cadex.ModelData_Point(), new cadex.ModelData_Direction(-1, 0, 0));
    super(aPlane);

    this.planeId = `${++ClipPlane.globalClipPlaneIndex}`;
    this.min = 0;
    this.max = 100;
    // in percents, from 0 to 100
    this.myValue = 50;
    this.myBBox = theBBox.clone();
    this.myAxis = theAxis;
    this.myReverse = false;

    this.updateRange();

    this.planePanel = this.createPlanePanel();

    // TODO: UI updating on clip plane changing by input
  }

  get value() {
    return this.myValue;
  }

  set value(theValue) {
    if (theValue < 0) {
      theValue = 0;
    }
    if (theValue > 100) {
      theValue = 100;
    }
    this.myValue = theValue;

    const aHtmlValue = `${this.myValue}`;
    const aRangeInput = /** @type {HTMLInputElement} */(this.planePanel.querySelector(`#position-range-${this.planeId}`));
    aRangeInput.value = aHtmlValue;

    const aPercentInput = /** @type {HTMLInputElement} */(this.planePanel.querySelector(`#position-percent-${this.planeId}`));
    aPercentInput.value = aHtmlValue;

    this.updatePlane();
  }

  get bbox() {
    return this.myBBox;
  }

  set bbox(theBBox) {
    this.myBBox.copy(theBBox);
    this.updateRange();
  }

  get axis() {
    return this.myAxis;
  }
  set axis(theAxis) {
    this.myAxis = theAxis;
    this.updateRange();
  }

  get reverse() {
    return this.myReverse;
  }
  set reverse(theReverse) {
    this.myReverse = theReverse;
    this.updatePlane();
  }

  updateRange() {
    this.min = this.myBBox.minCorner[this.myAxis];
    this.max = this.myBBox.maxCorner[this.myAxis];
    // Add additional 1% gap to avoid rendering artifacts
    const gap = (this.max - this.min) / 100;
    this.min -= gap;
    this.max += gap;
    this.updatePlane();
  }

  updatePlane() {
    const aPlane = this.plane;
    this.bbox.getCenter(aPlane.location);
    const aPositionValue = this.min + (this.max - this.min) * (this.value / 100);
    switch (this.axis) {
      case CliPlaneAxis.x:
        aPlane.location.x = aPositionValue;
        aPlane.direction.setCoord(this.reverse ? 1 : -1, 0, 0);
        break;
      case CliPlaneAxis.y:
        aPlane.location.y = aPositionValue;
        aPlane.direction.setCoord(0, this.reverse ? -1 : 1, 0);
        break;
      case CliPlaneAxis.z:
        aPlane.location.z = aPositionValue;
        aPlane.direction.setCoord(0, 0, this.reverse ? 1 : -1);
        break;
    }
    // just re-assign plane to apply plane changes and redraw viewport
    this.plane = aPlane;
  }

  onPositionChangedByScene() {
    this.value = (this.plane.location[this.axis] - this.min) * 100 / (this.max - this.min);
  }

  createPlanePanel() {
    const aPlanePanel = document.createElement('div');
    aPlanePanel.classList.add('plane-panel');
    aPlanePanel.id = this.planeId;

    const anAxesSection = document.createElement('div');
    anAxesSection.classList.add('plane-panel__axes-section');
    aPlanePanel.appendChild(anAxesSection);

    const aPlaneTitle = document.createElement('span');
    aPlaneTitle.classList.add('plane-panel__plane-title');
    aPlaneTitle.innerText = 'Plane';
    anAxesSection.appendChild(aPlaneTitle);

    Object.keys(CliPlaneAxis).forEach((theAxis) => {
      const anAxisSection = document.createElement('div');
      anAxisSection.classList.add('plane-panel__axis-section');

      const anAxisRadio = document.createElement('input');
      anAxisRadio.id = `radio-${theAxis}-${this.planeId}`;
      anAxisRadio.type = 'radio';
      anAxisRadio.name = `radio-axes-${this.planeId}`;
      anAxisRadio.value = theAxis;
      anAxisRadio.checked = theAxis === this.axis;
      anAxisRadio.onclick = () => {
        this.axis = CliPlaneAxis[theAxis];
      };

      const anAxisLabel = document.createElement('label');
      anAxisLabel.htmlFor = anAxisRadio.id;
      anAxisLabel.innerText = theAxis.toUpperCase();

      anAxisSection.appendChild(anAxisRadio);
      anAxisSection.appendChild(anAxisLabel);

      anAxesSection.appendChild(anAxisSection);
    });

    const aDivider = document.createElement('div');
    aDivider.classList.add('plane-panel__divider');
    aPlanePanel.appendChild(aDivider);

    const aCappingCheckboxSection = document.createElement('div');
    aCappingCheckboxSection.classList.add('plane-panel__capping-checkbox-section');
    aPlanePanel.appendChild(aCappingCheckboxSection);

    const aCappingCheckbox = document.createElement('input');
    aCappingCheckbox.classList.add('plane-panel__checkbox-capping');
    aCappingCheckbox.id = `checkbox-capping-${this.planeId}`;
    aCappingCheckbox.type = 'checkbox';
    aCappingCheckbox.name = aCappingCheckbox.id;
    aCappingCheckbox.checked = true;
    aCappingCheckbox.onchange = (theEvent) => {
      theEvent.preventDefault();
      this.isCappingEnabled = aCappingCheckbox.checked;
    };

    const aCappingLabel = document.createElement('label');
    aCappingLabel.htmlFor = aCappingCheckbox.id;
    aCappingLabel.innerText = 'Capping';

    const aCappingColorChooser = document.createElement('input');
    aCappingColorChooser.classList.add('plane-panel__checkbox-capping-color-input');
    aCappingColorChooser.id = `checkbox-capping-color-input-${this.planeId}`;
    aCappingColorChooser.type = 'color';
    aCappingColorChooser.name = aCappingCheckbox.id;
    aCappingColorChooser.value = '#CDCDCD'; // default WTK color
    aCappingColorChooser.onchange = (theEvent) => {
      theEvent.preventDefault();
      const aStringColor = aCappingColorChooser.value;
      const r = parseInt(aStringColor.charAt(1) + aStringColor.charAt(2), 16) / 255;
      const g = parseInt(aStringColor.charAt(3) + aStringColor.charAt(4), 16) / 255;
      const b = parseInt(aStringColor.charAt(5) + aStringColor.charAt(6), 16) / 255;

      this.cappingAppearance = new cadex.ModelData_Appearance(new cadex.ModelData_ColorObject(r, g, b));
    };

    aCappingCheckboxSection.appendChild(aCappingCheckbox);
    aCappingCheckboxSection.appendChild(aCappingLabel);
    aCappingCheckboxSection.appendChild(aCappingColorChooser);

    const aHatchingCheckboxSection = document.createElement('div');
    aHatchingCheckboxSection.classList.add('plane-panel__hatching-checkbox-section');
    aPlanePanel.appendChild(aHatchingCheckboxSection);

    const aHatchingCheckbox = document.createElement('input');
    aHatchingCheckbox.classList.add('plane-panel__checkbox-hatching');
    aHatchingCheckbox.id = `checkbox-hatching-${this.planeId}`;
    aHatchingCheckbox.type = 'checkbox';
    aHatchingCheckbox.name = aHatchingCheckbox.id;
    aHatchingCheckbox.checked = true;
    aHatchingCheckbox.onchange = (theEvent) => {
      theEvent.preventDefault();
      this.isHatchingEnabled = aHatchingCheckbox.checked;
    };

    const aHatchingLabel = document.createElement('label');
    aHatchingLabel.htmlFor = aHatchingCheckbox.id;
    aHatchingLabel.innerText = 'Hatching';

    aHatchingCheckboxSection.appendChild(aHatchingCheckbox);
    aHatchingCheckboxSection.appendChild(aHatchingLabel);

    const aReverseCheckboxSection = document.createElement('div');
    aReverseCheckboxSection.classList.add('plane-panel__reverse-checkbox-section');
    aPlanePanel.appendChild(aReverseCheckboxSection);

    const aReverseCheckbox = document.createElement('input');
    aReverseCheckbox.classList.add('plane-panel__checkbox-reverse');
    aReverseCheckbox.id = `checkbox-reverse-${this.planeId}`;
    aReverseCheckbox.type = 'checkbox';
    aReverseCheckbox.name = aReverseCheckbox.id;
    aReverseCheckbox.checked = false;
    aReverseCheckbox.onchange = (theEvent) => {
      theEvent.preventDefault();
      this.reverse = aReverseCheckbox.checked;
    };

    const aReverseLabel = document.createElement('label');
    aReverseLabel.htmlFor = aReverseCheckbox.id;
    aReverseLabel.innerText = 'Reversed plane';

    aReverseCheckboxSection.appendChild(aReverseCheckbox);
    aReverseCheckboxSection.appendChild(aReverseLabel);


    const aPositionRangeSection = document.createElement('div');
    aPositionRangeSection.classList.add('plane-panel__position-range-section');
    aPlanePanel.appendChild(aPositionRangeSection);

    const aPlanePositionRange = document.createElement('input');
    aPlanePositionRange.classList.add('plane-panel__position-range');
    aPlanePositionRange.id = `position-range-${this.planeId}`;
    aPlanePositionRange.type = 'range';
    aPlanePositionRange.min = '0';
    aPlanePositionRange.max = '100';
    aPlanePositionRange.step = '1';
    aPlanePositionRange.value = `${this.value}`;
    aPlanePositionRange.oninput = (theEvent) => {
      theEvent.preventDefault();
      this.value = Number(aPlanePositionRange.value);
    };

    const aPlanePositionPercent = document.createElement('input');
    aPlanePositionPercent.classList.add('plane-panel__position-percent');
    aPlanePositionPercent.id = `position-percent-${this.planeId}`;
    aPlanePositionPercent.type = 'number';
    aPlanePositionPercent.min = '0';
    aPlanePositionPercent.max = '100';
    aPlanePositionPercent.value = `${this.value}`;
    aPlanePositionPercent.oninput = (theEvent) => {
      theEvent.preventDefault();
      this.value = Number(aPlanePositionPercent.value);
    };

    aPositionRangeSection.appendChild(aPlanePositionRange);
    aPositionRangeSection.appendChild(aPlanePositionPercent);
    aPositionRangeSection.append('%');

    const anDeletePlaneBtn = document.createElement('img');
    anDeletePlaneBtn.classList.add('plane-panel__delete-plane-btn');
    anDeletePlaneBtn.src = '/assets/images/delete.svg';
    anDeletePlaneBtn.alt = 'basket';
    anDeletePlaneBtn.onclick = () => {
      this.dispatchEvent({ type: 'deletionRequired' });
    };
    aPlanePanel.appendChild(anDeletePlaneBtn);

    return aPlanePanel;
  }
}

ClipPlane.globalClipPlaneIndex = 0;

class ClipPlaneManager extends cadex.ModelPrs_ClipPlanesManager {
  /**
   * @param {cadex.ModelPrs_Scene} theScene
   */
  constructor(theScene) {
    super();
    this.listOfClipPlanesDom = /** @type {HTMLElement} */(document.querySelector('.clip-planes'));
    this.scene = theScene;
    this.defaultBBox = new cadex.ModelData_Box(new cadex.ModelData_Point(-100, -100, -100), new cadex.ModelData_Point(100, 100, 100));

    theScene.addEventListener('boundingBoxChanged', this.updatePlaneBBox.bind(this));
  }

  updatePlaneBBox() {
    let aBBox = this.scene.boundingBox;
    if (aBBox.isEmpty()) {
      aBBox = this.defaultBBox;
    }
    for (const aPlane of this.globalClipPlanes()) {
      /** @type {ClipPlane} */(aPlane).bbox = aBBox;
    }
  }

  addGlobalClipPlane() {
    if (this.numberOfGlobalClipPlanes >= 3) {
      return;
    }

    const anAlreadyUsedAxes = [];
    for (const aPlane of this.globalClipPlanes()) {
      anAlreadyUsedAxes.push(/** @type {ClipPlane} */(aPlane).axis);
    }

    const aMissingAxis = Object.values(CliPlaneAxis).filter(theAxis => !anAlreadyUsedAxes.includes(theAxis))[0];

    let aBBox = this.scene.boundingBox;
    if (aBBox.isEmpty()) {
      aBBox = this.defaultBBox;
    }
    const aClipPlane = new ClipPlane(aBBox, aMissingAxis);
    /* Enable reverse of plane: */
    // aClipPlane.reverse = true;
    /* Disable capping of plane: */
    // aClipPlane.isCappingEnabled = false;
    /* Hide controls (arrows) of plane: */
    // aClipPlane.isShowControls = false;
    /* Hide plane on the scene: */
    // aClipPlane.isShowPlane = false;
    aClipPlane.addEventListener('deletionRequired', () => {
      this.removeGlobalClipPlane(aClipPlane);
    });

    super.addGlobalClipPlane(aClipPlane);

    this.listOfClipPlanesDom.appendChild(aClipPlane.planePanel);
  }

  /**
   * @param {ClipPlane} thePlane
   */
  removeGlobalClipPlane(thePlane) {
    super.removeGlobalClipPlane(thePlane);
    thePlane.planePanel.remove();
  }

  removeAllGlobalClipPlanes() {
    super.removeAllGlobalClipPlanes();
    this.listOfClipPlanesDom.innerHTML = ''; /* Remove all planes from layout. */
  }
}

class SectioningExample {
  constructor() {
    // The model
    this.model = new cadex.ModelData_Model();
    // The scene for visualization
    this.scene = new cadex.ModelPrs_Scene();
    // Subscribe to selection events

    // The viewport for visualization. Initializing with default config and element attach to.
    this.viewport = new cadex.ModelPrs_ViewPort({}, /** @type {HTMLElement} */(document.getElementById('file-viewer')));
    // Use custom clip plane manager with binding to UI elements
    this.clipPlaneManager = new ClipPlaneManager(this.scene);
    this.viewport.clipPlanesManager = this.clipPlaneManager;
    // Attach viewport to scene to render content of
    this.viewport.attachToScene(this.scene);

    const aClipPlaneInputHandler = new cadex.ModelPrs_ClipPlaneInputHandler(this.viewport);
    this.viewport.inputManager.pushInputHandler(aClipPlaneInputHandler);

    aClipPlaneInputHandler.addEventListener('clipPlaneMoved', (theEvent) => {
      /** @type {ClipPlane} */ (theEvent.clipPlane).onPositionChangedByScene();
    });

    // Setup UI buttons
    /** @type {HTMLButtonElement} */(document.querySelector('#btn-add-plane')).onclick = () => {
      this.clipPlaneManager.addGlobalClipPlane();
    };
    /** @type {HTMLButtonElement} */(document.querySelector('#btn-clear')).onclick = () => {
      this.clipPlaneManager.removeAllGlobalClipPlanes();
    };
  }

  /**
   * @param {string} theModelPath
   */
  async loadAndDisplayModel(theModelPath) {
    try {
      // Clean up scene to display new model
      this.scene.clear();
      await this.scene.update();

      // Model uses multiple external files, so requires provider to fetch it.
      /** @type {cadex.ModelData_CDXFBBufferProvider} */
      const dataLoader = (theModelPath, theObjId, theProgressScope) => {
        return fetchFile(modelUrl(theModelPath) + '/' + theObjId, theProgressScope);
      };

      // Load model by URL.
      const aLoadResult = await this.model.loadFile(theModelPath, dataLoader, false /*append roots*/);
      console.log(`${theModelPath} is loaded\n`, aLoadResult);

      const aSceneNodeFactory = new cadex.ModelPrs_SceneNodeFactory();
      let aRepMask = aLoadResult.hasBRepRep ? cadex.ModelData_RepresentationMask.ModelData_RM_BRep : cadex.ModelData_RepresentationMask.ModelData_RM_Poly;
      const aSceneNode = await aSceneNodeFactory.createGraphFromModel(this.model, aRepMask);
      if (!aSceneNode) {
        throw new Error('Unable to create scene node from model.');
      }
      aSceneNode.displayMode = aLoadResult.hasBRepRep ? cadex.ModelPrs_DisplayMode.ShadedWithBoundaries : cadex.ModelPrs_DisplayMode.Shaded;
      this.scene.addRoot(aSceneNode);

      // Update scene to apply changes.
      await updateSceneSmoothly(this.scene, this.viewport);

      // Finally move camera to position when the whole model is in sight
      this.viewport.fitAll();
    }
    catch (theErr) {
      console.log('Unable to load and display model: ', theErr);
      alert(`Unable to load model "${theModelPath}" [${/** @type {Error} */(theErr).message}]`);
    }
  }
}
const aSectioningExample = new SectioningExample();

initModelSelector('FZK Haus.ifc', aSectioningExample.loadAndDisplayModel.bind(aSectioningExample));
