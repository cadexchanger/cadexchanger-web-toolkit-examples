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

import { fetchFile, getModelList, modelUrl, updateSceneSmoothly } from '../assets/js/helpers.mjs';
import cadex from '@cadexchanger/web-toolkit';

import React from 'react';
import { createRoot } from 'react-dom/client';

const e = React.createElement;

class CadExReactViewer extends React.Component {

  constructor(props) {
    super(props);
    if (this.props.model && this.props.model.path) {
      this.loadAndDisplayModel(this.props.model.path);
    }
  }

  componentDidMount() {
    // Create model
    this.model = new cadex.ModelData_Model();
    // Create scene for visualization
    this.scene = new cadex.ModelPrs_Scene();

    // Create viewport with default config and div element attach to.
    this.viewPort = new cadex.ModelPrs_ViewPort({}, /** @type {HTMLElement} */(this.container));
    // Attach viewport to scene to render content of it
    this.viewPort.attachToScene(this.scene);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.model !== this.props.model && this.props.model && this.props.model.path) {
      this.loadAndDisplayModel(this.props.model.path);
    }
  }

  componentWillUnmount() {
    /** @type {cadex.ModelPrs_ViewPort} */(this.viewPort).detachFromScene();
    const aScene = /** @type {cadex.ModelPrs_Scene} */(this.scene);
    aScene.clear();
    aScene.update();
    this.scene = null;
    this.model = null;
    this.viewPort = null;
  }

  /**
   * @param {string} theModelPath
   */
  async loadAndDisplayModel(theModelPath) {
    try {
      const aScene = /** @type {cadex.ModelPrs_Scene} */(this.scene);
      const aModel = /** @type {cadex.ModelData_Model} */(this.model);
      const aViewPort = /** @type {cadex.ModelPrs_ViewPort} */(this.viewPort);

      // Clean up scene to display new model
      aScene.clear();
      await aScene.update();

      // Model uses multiple external files, so requires provider to fetch it.
      /** @type {cadex.ModelData_CDXFBBufferProvider} */
      const dataLoader = (theModelPath, theObjId, theProgressScope) => {
        return fetchFile(modelUrl(theModelPath) + '/' + theObjId, theProgressScope);
      };

      // Load model by URL.
      const aLoadResult = await aModel.loadFile(theModelPath, dataLoader, false /*append roots*/);
      console.log(`${theModelPath} is loaded\n`, aLoadResult);

      // Create visualization graph for model.
      const aSceneNodeFactory = new cadex.ModelPrs_SceneNodeFactory();

      let aRepMask = aLoadResult.hasBRepRep ? cadex.ModelData_RepresentationMask.ModelData_RM_BRep : cadex.ModelData_RepresentationMask.ModelData_RM_Poly;
      const aSceneNode = await aSceneNodeFactory.createGraphFromModel(aModel, aRepMask);
      if (!aSceneNode) {
        throw new Error('Unable to create scene node from model.');
      }
      aSceneNode.displayMode = aLoadResult.hasBRepRep ? cadex.ModelPrs_DisplayMode.ShadedWithBoundaries : cadex.ModelPrs_DisplayMode.Shaded;
      aSceneNode.selectionMode = cadex.ModelPrs_SelectionMode.Body | cadex.ModelPrs_SelectionMode.PolyShape;

      aScene.addRoot(aSceneNode);

      // Update scene to apply changes.
      await updateSceneSmoothly(aScene, aViewPort);

      // Finally move camera to position when the whole model is in sight
      aViewPort.fitAll();
    }
    catch (theErr) {
      console.error('Unable to load and display model: ', theErr);
      alert(`Unable to load model "${theModelPath}" [${/** @type {Error} */(theErr).message}]`);
    }

  }

  render() {
    // JSX
    // return (<div id="file-viewer" ref={div => this.container = div}></div>);
    return e('div', { ref: div => this.container = div, id: 'file-viewer' });
  }
}

class CadExReactViewerApp extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      models: /** @type {Array<*>}*/([]),
      currentModel: /** @type {*} */(null)
    };
    this.onModelSelectorChanged = this.onModelSelectorChanged.bind(this);

    this.feedModelList();
  }

  async feedModelList() {
    const aModelList = await getModelList();
    this.setState({
      models: aModelList,
      currentModel: aModelList.find(m => m.name === 'Rotary Tiller.sldprt')
    });
  }

  onModelSelectorChanged(theEvent) {
    this.setState({
      currentModel: this.state.models[theEvent.target.selectedIndex]
    });
  }

  render() {
    const options = this.state.models.map(model => {
      // JSX
      // return <option key="{model.name}">{model.name}</option>;
      return React.createElement('option', { key: model.name }, model.name);
    });

    const aCurrentModelName = this.state.currentModel ? this.state.currentModel.name : '';

    // JSX
    // return (
    //   <div className="examples-container">
    //     <CadExReactViewer model={this.state.currentModel}/>
    //     <div id="model-selector">
    //       <div>Select model:</div>
    //       <select value={aCurrentModelName} onChange={this.onModelSelectorChanged}>
    //         {options}
    //       </select>
    //     </div>
    //   </div>
    // );

    return React.createElement('div', { id: 'example-container' },
      React.createElement(CadExReactViewer, { model: this.state.currentModel }),
      React.createElement('div', { id: 'model-selector' },
        React.createElement('div', null, 'Select model:'),
        React.createElement('select', {
          value: aCurrentModelName,
          onChange: this.onModelSelectorChanged
        }, options)
      )
    );
  }
}

const domContainer = /** @type {HTMLElement} */(document.getElementById('root'));
const root = createRoot(domContainer);
root.render(e(CadExReactViewerApp));
