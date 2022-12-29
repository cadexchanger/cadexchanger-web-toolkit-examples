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

class ExploderExample {
  constructor() {
    // The model
    this.model = new cadex.ModelData_Model();
    // The scene for visualization
    this.scene = new cadex.ModelPrs_Scene();

    // The viewport for visualization. Initializing with default config and element attach to.
    this.viewport = new cadex.ModelPrs_ViewPort({}, /** @type {HTMLElement} */(document.getElementById('file-viewer')));
    // Attach viewport to scene to render content of
    this.viewport.attachToScene(this.scene);

    /** @type {HTMLButtonElement} */(document.getElementById('exploder-fit-all-button')).onclick = () => {
      this.viewport.fitAll();
    };

    this.initExploderSlider();
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
      aSceneNode.selectionMode = cadex.ModelPrs_SelectionMode.Body | cadex.ModelPrs_SelectionMode.PolyShape;

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

  initExploderSlider() {
    const anExploderSlider = /** @type {HTMLSelectElement} */(document.querySelector('#exploder-slider>input'));
    const anExploderValue = /** @type {HTMLElement} */(document.getElementById('exploder-value'));
    const aExploderAutoFitAllCheckbox = /** @type {HTMLInputElement} */(document.getElementById('exploder-fit-all-auto-checkbox'));

    anExploderSlider.oninput = () => {
      const aSliderValue = parseInt(anExploderSlider.value);
      this.viewport.exploder.isActive = aSliderValue !== 0;
      this.viewport.exploder.value =  aSliderValue / 100;
      anExploderValue.textContent = `${anExploderSlider.value}%`;
    };
    anExploderSlider.onchange = () => {
      if (aExploderAutoFitAllCheckbox.checked) {
        this.viewport.fitAll();
      }
    };
  }
}

const anExploderExample = new ExploderExample();

initModelSelector('Double WishBone Suspension.CATProduct', anExploderExample.loadAndDisplayModel.bind(anExploderExample));
