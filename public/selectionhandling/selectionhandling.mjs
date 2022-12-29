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

import { fetchFile, initModelSelector, modelUrl } from '../assets/js/helpers.mjs';

import cadex from '@cadexchanger/web-toolkit';

/**
 * Interface for additional 'sge' property.
 * @typedef CustomSceneNode
 * @property {?cadex.ModelData_SceneGraphElement} sge
 * @property {?cadex.ModelData_Representation} representation
 * @property {?string} name
 */

class SceneGraphConverter extends cadex.ModelData_SceneGraphElementVisitor {
  /**
   * @param {cadex.ModelData_RepresentationMask} theRepMask
   * @param {cadex.ModelPrs_SceneNode} theNode
   */
  constructor(theRepMask, theNode) {
    super();
    this.sceneNodes = [theNode];
    /** @type {cadex.ModelData_Instance|null} */
    this.lastInstance = null;
    this.sceneNodeFactory = new cadex.ModelPrs_SceneNodeFactory();
    this.repMask = theRepMask;
  }

  /**
   * @param {!cadex.ModelData_SceneGraphElement} theElement
   * @param {boolean} theAddToStack
   * @returns {cadex.ModelPrs_SceneNode & CustomSceneNode}
   */
  addSceneNode(theElement, theAddToStack) {
    const aNode = /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(this.sceneNodeFactory.createNodeFromSceneGraphElement(theElement));
    this.sceneNodes[this.sceneNodes.length - 1].addChildNode(aNode);
    aNode.sge = theElement;
    if (theAddToStack) {
      this.sceneNodes.push(aNode);
    }
    return aNode;
  }

  /**
   * @override
   * @param {!cadex.ModelData_Part} thePart
   */
  visitPart(thePart) {
    const aPartNode = this.addSceneNode(thePart, false);
    aPartNode.name = this.lastInstance?.name || thePart.name;
    this.sceneNodes[this.sceneNodes.length - 1].addChildNode(aPartNode);

    let aRepresentationNode;
    const aRepresentation = thePart.representation(this.repMask);
    if (aRepresentation) {
      aRepresentationNode = /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(this.sceneNodeFactory.createNodeFromRepresentation(aRepresentation));
      // Representation node is the main node used for selection
      aRepresentationNode.representation = aRepresentation;
      aPartNode.addChildNode(aRepresentationNode);
    }
  }
  /**
   * @override
   * @param {!cadex.ModelData_Instance} theInstance
   */
  visitInstanceEnter(theInstance) {
    this.addSceneNode(theInstance, true);
    this.lastInstance = theInstance;
    return true;
  }
  /**
   * @override
   * @param {!cadex.ModelData_Instance} _theInstance
   */
  visitInstanceLeave(_theInstance) {
    this.sceneNodes.pop();
    this.lastInstance = null;
  }
  /**
   * @override
   * @param {!cadex.ModelData_Assembly} theAssembly
   */
  visitAssemblyEnter(theAssembly) {
    this.addSceneNode(theAssembly, true);
    return true;
  }
  /**
   * @override
   * @param {!cadex.ModelData_Assembly} _theAssembly
   */
  visitAssemblyLeave(_theAssembly) {
    this.sceneNodes.pop();
  }
}

class SelectedEntityVisitor extends cadex.ModelPrs_SelectedEntityVisitor {
  constructor() {
    super();
    this.str = '';
  }
  /**
   * @override
   * @param {cadex.ModelPrs_SelectedShapeEntity} theShapeEntity
   */
  visitShapeEntity(theShapeEntity) {
    this.str = Object.keys(cadex.ModelData_ShapeType).find((type) => theShapeEntity.shape.type === cadex.ModelData_ShapeType[type]) || 'Unknown type';
    if (theShapeEntity.shape instanceof cadex.ModelData_Vertex) {
      this.str += theShapeEntity.shape.point.toString();
    }
  }

  /**
   * @override
   * @param {cadex.ModelPrs_SelectedPolyShapeEntity} _thePolyShapeEntity
   */
  visitPolyShapeEntity(_thePolyShapeEntity) {
    this.str = 'Poly shape';
  }

  /**
   * @override
   * @param {cadex.ModelPrs_SelectedPolyVertexEntity} thePolyVertexEntity
   */
  visitPolyVertexEntity(thePolyVertexEntity) {
    this.str = `Poly shape vertex [${thePolyVertexEntity.vertexIndex}]`;
  }
}

class PickResultFormatter extends cadex.ModelPrs_PickedEntityVisitor {
  constructor() {
    super();
    /** @type {string|null} */
    this.pickedEntityStr = null;
  }
  /**
   * @param {cadex.ModelPrs_SceneNode} theRepNode
   */
  partName(theRepNode) {
    const aPartName = /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(theRepNode.parent).name;
    return aPartName ? `"${aPartName}" part` : 'Unnamed part';
  }
  /**
   * @override
   * @param {cadex.ModelPrs_PickedNodeEntity} theEntity
   */
  visitPickedNodeEntity(theEntity) {
    const aRep = /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(theEntity.node).representation;
    this.pickedEntityStr = aRep ? this.partName(theEntity.node) : 'Unknown node';
  }

  /**
   * @override
   * @param {cadex.ModelPrs_PickedShapeEntity} theEntity
   */
  visitPickedShapeEntity(theEntity) {
    const aRep = /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(theEntity.node).representation;
    if (aRep) {
      const aPartName = this.partName(theEntity.node);
      const aBRepRep = /** @type {cadex.ModelData_BRepRepresentation} */(aRep);
      const aShapeId = aBRepRep.shapeId(theEntity.shape);
      const aShapeTypeName = Object.keys(cadex.ModelData_ShapeType).find((n) => cadex.ModelData_ShapeType[n] === theEntity.shape.type);
      this.pickedEntityStr = `${aShapeTypeName} ${aShapeId} of ${aPartName}`;
    } else {
      this.pickedEntityStr = 'Unknown node\'s shape';
    }
  }

  /**
   * @override
   * @param {cadex.ModelPrs_PickedPolyShapeEntity} theEntity
   */
  visitPickedPolyShapeEntity(theEntity) {
    const aRep = /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(theEntity.node).representation;
    if (aRep) {
      const aPartName = this.partName(theEntity.node);
      this.pickedEntityStr = `Poly shape of ${aPartName}`;
    } else {
      this.pickedEntityStr = 'Unknown node\' poly shape';
    }
  }

  /**
   * @override
   * @param {cadex.ModelPrs_PickedPolyVertexEntity} theEntity
   */
  visitPickedPolyVertexEntity(theEntity) {
    const aRep = /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(theEntity.node).representation;
    if (aRep) {
      const aPartName = this.partName(theEntity.node);
      this.pickedEntityStr = `Vertex ${theEntity.vertexIndex} of poly shape of ${aPartName}`;
    } else {
      this.pickedEntityStr = 'Unknown node\' poly shape vertex';
    }
  }

  /**
   * @override
   * @param {cadex.ModelPrs_PickedClipPlaneEntity} _theEntity
   */
  visitPickedClipPlaneEntity(_theEntity) {
    this.pickedEntityStr = 'Clip plane';
  }
}

class ContextMenuHandler extends cadex.ModelPrs_ContextMenuHandler {
  /**
   * @param {cadex.ModelPrs_Scene} theScene
   */
  constructor(theScene) {
    super();
    this.scene = theScene;
    this.contextMenuElement = /** @type {HTMLElement}*/(document.getElementById('context-menu'));

    // Hide mouse menu by any mouse press
    document.addEventListener('pointerdown', (theEvent) => {
      if (/** @type {HTMLElement|null} */(theEvent?.target)?.closest('.context-menu')) {
        this.hideContextMenu();
      }
    });
  }

  /**
   * @override
   * @param {cadex.ModelPrs_PointerInputEvent} theEvent
   */
  contextMenu(theEvent) {
    const aPosition = theEvent.point.position;
    const aPickResult = this.scene.selectionManager.pickFromViewport(aPosition.x, aPosition.y, theEvent.viewport);
    if (aPickResult) {
      const aPickedEntityVisitor = new PickResultFormatter();
      aPickResult.pickedEntity.accept(aPickedEntityVisitor);
      this.contextMenuElement.innerHTML = aPickedEntityVisitor.pickedEntityStr || 'Unable to parse pick result';
    } else {
      this.contextMenuElement.innerHTML = 'No object detected';
    }
    this.contextMenuElement.style.display = 'block';
    this.contextMenuElement.style.left = `${aPosition.x}px`;
    this.contextMenuElement.style.top = `${aPosition.y}px`;
  }

  hideContextMenu() {
    this.contextMenuElement.style.display = '';
  }
}
class SelectionHandlingExample {
  constructor() {
    // Create model
    this.model = new cadex.ModelData_Model();
    // Create scene for visualization
    this.scene = new cadex.ModelPrs_Scene();
    // Subscribe to selection changed events
    this.scene.selectionManager.addEventListener('selectionChanged', this.onSelectionChanged.bind(this));

    // Create viewport with default config and div element attach to.
    this.viewport = new cadex.ModelPrs_ViewPort({}, /** @type {HTMLElement} */(document.getElementById('file-viewer')));
    // Attach viewport to scene to render content of it
    this.viewport.attachToScene(this.scene);

    // Hover and highlighting are disabled by default due performance reasons. Enable it.
    this.viewport.inputManager.isHoverEnabled = true;
    this.viewport.inputManager.pushInputHandler(new cadex.ModelPrs_HighlightingHandler(this.viewport));

    // Enables context menu handling
    const aContextMenuHandler = new ContextMenuHandler(this.scene);
    this.viewport.inputManager.pushInputHandler(aContextMenuHandler);

    // Use separate scene root to store actual selection mode.
    this.rootSceneNode = new cadex.ModelPrs_SceneNode();
    this.scene.addRoot(this.rootSceneNode);

    const aSelectionModeSelector = /** @type {HTMLSelectElement} */(document.querySelector('#selection-mode-selector>select'));
    const onSelectionModeChanged = () => {
      this.rootSceneNode.selectionMode = cadex.ModelPrs_SelectionMode[aSelectionModeSelector.value];
      this.scene.update();
    };
    aSelectionModeSelector.onchange = onSelectionModeChanged;
    onSelectionModeChanged();
  }

  /**
   * @param {string} theModelPath
   */
  async loadAndDisplayModel(theModelPath) {
    try {
      // Clean up scene to display new model
      this.rootSceneNode.removeChildNodes();
      await this.scene.update();

      // Model uses multiple external files, so requires provider to fetch it.
      /** @type {cadex.ModelData_CDXFBBufferProvider} */
      const dataLoader = (theModelPath, theObjId, theProgressScope) => {
        return fetchFile(modelUrl(theModelPath) + '/' + theObjId, theProgressScope);
      };

      // Load model by URL.
      const aLoadResult = await this.model.loadFile(theModelPath, dataLoader, false /*append roots*/);
      console.log(`${theModelPath} is loaded\n`, aLoadResult);

      const aSelectionModeSelector = /** @type {HTMLSelectElement} */(document.querySelector('#selection-mode-selector>select'));

      const aBRepSelectionModeGroup = /** @type {HTMLOptGroupElement} */(aSelectionModeSelector.querySelector('optgroup[label*="B-Rep"]'));
      aBRepSelectionModeGroup.disabled = !aLoadResult.hasBRepRep;

      const aPolySelectionModeGroup = /** @type {HTMLOptGroupElement} */(aSelectionModeSelector.querySelector('optgroup[label*="Poly"]'));
      aPolySelectionModeGroup.disabled = aLoadResult.hasBRepRep;

      aSelectionModeSelector.value = aLoadResult.hasBRepRep ? 'Face' : 'PolyShape';

      this.rootSceneNode.displayMode = aLoadResult.hasBRepRep ? cadex.ModelPrs_DisplayMode.ShadedWithBoundaries : cadex.ModelPrs_DisplayMode.Shaded;

      // Create visualization graph for model.
      let aRepMask = aLoadResult.hasBRepRep ? cadex.ModelData_RepresentationMask.ModelData_RM_BRep : cadex.ModelData_RepresentationMask.ModelData_RM_Poly;
      const aModelConverter = new SceneGraphConverter(aRepMask, this.rootSceneNode);
      await this.model.accept(aModelConverter);
      this.scene.addRoot(this.rootSceneNode);

      // Update scene to apply changes.
      await this.scene.update();

      // Finally move camera to position when the whole model is in sight
      this.viewport.fitAll();
    }
    catch (theErr) {
      console.log('Unable to load and display model: ', theErr);
      alert(`Unable to load model "${theModelPath}" [${/** @type {Error} */(theErr).message}]`);
    }
  }

  /**
   * @param {cadex.ModelPrs_SelectionChangedEvent} theEvent
   */
  onSelectionChanged(theEvent) {
    /**
     * @param {cadex.ModelPrs_SelectionItem} theItem
     * @returns {string}
     */
    const formatItem = (theItem) => {
      let aMessage = '';
      const aRepNode = /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(theItem.node);
      if (!aRepNode.representation) {
        return 'Unknown item';
      }
      const aPartName = /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(aRepNode.parent).name;
      aMessage += `{\n  part: ${aPartName ? `"${aPartName}" ` : 'Unnamed'}\n`;
      if (theItem.numberOfEntities > 0) {
        aMessage += '  entities: [';
        const aSelectedEntityVisitor = new SelectedEntityVisitor();
        for (const anEntity of theItem.entities()) {
          anEntity.accept(aSelectedEntityVisitor);
          aMessage += `\n    ${aSelectedEntityVisitor.str},`;
        }
        aMessage += '\n  ]\n';
      }
      aMessage += '}';

      return aMessage;
    };

    if (theEvent.removed.length > 0) {
      let aMessage = `Deselected ${theEvent.removed.length} item${theEvent.removed.length > 1 ? 's' : ''}:\n`;
      aMessage += theEvent.removed.map(formatItem).join('\n');
      console.log(aMessage);
    }
    if (theEvent.added.length > 0) {
      let aMessage = `Selected ${theEvent.added.length} item${theEvent.added.length > 1 ? 's' : ''}:\n`;
      aMessage += theEvent.added.map(formatItem).join('\n');
      console.log(aMessage);
    }
  }
}

const aSelectionHandlingExample = new SelectionHandlingExample();

initModelSelector('RIDGID_planeur_TP13000.dwg', aSelectionHandlingExample.loadAndDisplayModel.bind(aSelectionHandlingExample));

