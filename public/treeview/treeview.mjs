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

/* global $ */

/**
 * Interface for additional 'treeId' property.
 * @typedef CustomSceneNode
 * @property {?string} treeId
 */

class SceneGraphToTreeConverter extends cadex.ModelData_SceneGraphElementVisitor {
  /**
   * @param {any} theJsTree
   * @param {string} theRootNodeId
   * @param {cadex.ModelData_RepresentationMask} theRepMask
   */
  constructor(theJsTree, theRootNodeId, theRepMask) {
    super();
    this.jstree = theJsTree;
    this.treeNodes = [theRootNodeId];
    this.sceneNodes = [new cadex.ModelPrs_SceneNode()];
    /** @type {cadex.ModelData_Instance|null} */
    this.lastInstance = null;
    this.sceneNodeFactory = new cadex.ModelPrs_SceneNodeFactory();
    this.repMask = theRepMask;
  }
  currentTreeNode() {
    return this.treeNodes[this.treeNodes.length - 1];
  }
  currentSceneNode() {
    return this.sceneNodes[this.sceneNodes.length - 1];
  }

  /**
   * @param {!cadex.ModelData_SceneGraphElement} theElement
   * @param {boolean} theAddToStack
   */
  addSceneNode(theElement, theAddToStack) {
    const aSceneNode = this.sceneNodeFactory.createNodeFromSceneGraphElement(theElement);
    this.currentSceneNode().addChildNode(aSceneNode);
    if (theAddToStack) {
      this.sceneNodes.push(aSceneNode);
    }
    return aSceneNode;
  }
  /**
   * @override
   * @param {!cadex.ModelData_Part} thePart
   */
  visitPart(thePart) {
    const anInstanceNode = this.lastInstance && this.currentSceneNode();
    const aPartNode = this.addSceneNode(thePart, false);
    let aRepresentationNode;
    const aRepresentation = thePart.representation(this.repMask);
    if (aRepresentation) {
      aRepresentationNode = this.sceneNodeFactory.createNodeFromRepresentation(aRepresentation);
      aPartNode.addChildNode(aRepresentationNode);
    }

    const aSceneNode = anInstanceNode || aPartNode;

    const aTreeItem = {
      text: this.lastInstance?.name || thePart.name || 'Unnamed Part',
      type: 'part',
      data: {
        sge: this.lastInstance || thePart,
        sceneNode: aSceneNode,
      }
    };
    const aNodeId = this.jstree.create_node(this.currentTreeNode(), aTreeItem);
    this.jstree.loading_node(aNodeId);

    /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(aSceneNode).treeId = aNodeId;
    if (aRepresentationNode) {
      /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(aRepresentationNode).treeId = aNodeId;
    }

    const aGeometry = aRepresentationNode && aRepresentationNode.geometry;
    if (aGeometry) {
      aGeometry.addEventListener('stateChanged', () => {
        switch (aGeometry.state) {
          case cadex.ModelPrs_GeometryState.Loading:
            this.jstree.loading_node(aNodeId);
            break;
          case cadex.ModelPrs_GeometryState.Completed:
            this.jstree.display_node(aNodeId);
            break;
          case cadex.ModelPrs_GeometryState.Failed:
            this.jstree.error_node(aNodeId);
            break;
          default:
            break;
        }
      });
    }
  }
  /**
   * @override
   * @param {!cadex.ModelData_Instance} theInstance
   */
  visitInstanceEnter(theInstance) {
    this.lastInstance = theInstance;
    this.addSceneNode(theInstance, true);
    return true;
  }
  /**
   * @override
   * @param {!cadex.ModelData_Instance} _theInstance
   */
  visitInstanceLeave(_theInstance) {
    this.lastInstance = null;
    this.sceneNodes.pop();
  }
  /**
   * @override
   * @param {!cadex.ModelData_Assembly} theAssembly
   */
  visitAssemblyEnter(theAssembly) {
    const anInstanceNode = this.lastInstance && this.currentSceneNode();
    let anAssemblyNode = this.addSceneNode(theAssembly, true);
    const aSceneNode = anInstanceNode || anAssemblyNode;

    const aTreeItem = {
      text: this.lastInstance?.name || theAssembly.name || 'Unnamed Assembly',
      type: 'assembly',
      data: {
        sge: this.lastInstance || theAssembly,
        sceneNode: aSceneNode,
      }
    };
    const aNodeId = this.jstree.create_node(this.currentTreeNode(), aTreeItem);
    this.jstree.loading_node(aNodeId);
    /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(aSceneNode).treeId = aNodeId;
    this.treeNodes.push(aNodeId);

    return true;
  }
  /**
   * @override
   * @param {!cadex.ModelData_Assembly} _theAssembly
   */
  visitAssemblyLeave(_theAssembly) {
    this.treeNodes.pop();
    this.sceneNodes.pop();
  }
}

class TreeViewExample {
  constructor() {
    // The model
    this.model = new cadex.ModelData_Model();
    // The scene for visualization
    this.scene = new cadex.ModelPrs_Scene();

    // Subscribe to selection events
    this.scene.selectionManager.addEventListener('selectionChanged', this.onSelectionChangedByScene.bind(this));

    // Create viewport with default config and div element attach to.
    this.viewport = new cadex.ModelPrs_ViewPort({}, /** @type {HTMLElement} */(document.getElementById('file-viewer')));
    // Attach viewport to scene to render content of
    this.viewport.attachToScene(this.scene);

    const aJSTreeConfig = {
      core: {
        multiple: true,
        check_callback: true,
        themes: {
          name: null, //'default',
          dots: true,
        }
      },
      types: {
        file: {
          icon: 'icon-file'
        },
        assembly: {
          icon: 'icon-assembly'
        },
        instance: {
          icon: 'icon-instance'
        },
        part: {
          icon: 'icon-part'
        },
        pmi: {
          icon: 'icon-pmi'
        },
        'pmi-element': {
          icon: 'icon-pmi-element'
        }
      },
      plugins: ['wholerow', 'types', 'sgestates']
    };

    // Initialize jsTree library used for visualizing scenegraph structure (see https://www.jstree.com/)
    $('#file-scenegraph-container').jstree(aJSTreeConfig)
      .on('select_node.jstree', (_theEvent, theData) => this.onSelectedByTreeView(theData.node))
      .on('deselect_node.jstree', (_theEvent, theData) => this.onDeselectedByTreeView(theData.node))
      .on('deselect_all.jstree', (/*theEvent, theData*/) => this.onDeselectedAllByTreeView())
      .on('activate_node.jstree', (_theEvent, theData) => this.onDisplayedChangedByTreeView(theData.node, theData.displayed));

    this.sceneGraphTree = $('#file-scenegraph-container').jstree(true);
  }

  /**
   * @param {string} theModelPath
   * @param {string} theModelName
   */
  async loadAndDisplayModel(theModelPath, theModelName) {

    try {
      // Clean up scene to display new model
      this.scene.clear();
      await this.scene.update();

      const aRootNode = this.sceneGraphTree.get_node('#');
      aRootNode.children.forEach(theNodeId => this.sceneGraphTree.delete_node(theNodeId));

      // Model uses multiple external files, so requires provider to fetch it.
      /** @type {cadex.ModelData_CDXFBBufferProvider} */
      const dataLoader = (theModelPath, theObjId, theProgressScope) => {
        return fetchFile(modelUrl(theModelPath) + '/' + theObjId, theProgressScope);
      };

      // Load model by URL.
      const aLoadResult = await this.model.loadFile(theModelPath, dataLoader, false /*append roots*/);
      console.log(`${theModelPath} is loaded\n`, aLoadResult);

      // Create root file item
      const aFileNodeId = this.sceneGraphTree.create_node(null, {
        text: theModelName,
        type: 'file',
        data: {}
      });

      let aRepMask = aLoadResult.hasBRepRep ? cadex.ModelData_RepresentationMask.ModelData_RM_BRep : cadex.ModelData_RepresentationMask.ModelData_RM_Poly;

      // Feed tree with model structure
      const aVisitor = new SceneGraphToTreeConverter(this.sceneGraphTree, aFileNodeId, aRepMask);
      await this.model.accept(aVisitor);
      this.sceneGraphTree.open_all(null, 0);

      const aRootSceneNode = aVisitor.currentSceneNode();
      aRootSceneNode.displayMode = aLoadResult.hasBRepRep ? cadex.ModelPrs_DisplayMode.ShadedWithBoundaries : cadex.ModelPrs_DisplayMode.Shaded;
      aRootSceneNode.selectionMode = cadex.ModelPrs_SelectionMode.Node;
      this.scene.addRoot(aRootSceneNode);

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

  /**
   * @param {cadex.ModelPrs_SelectionChangedEvent} theEvent
   */
  onSelectionChangedByScene(theEvent) {
    theEvent.added.forEach((theAdded => {
      const anAddedObject = /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(theAdded.node);
      if (anAddedObject.treeId) {
        this.sceneGraphTree.select_node(anAddedObject.treeId);
      }
    }));
    theEvent.removed.forEach((theRemoved => {
      const aRemovedObject = /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(theRemoved.node);
      if (aRemovedObject.treeId) {
        this.sceneGraphTree.deselect_node(aRemovedObject.treeId);
      }
    }));
    // Handle deselectAll on click on empty space on the viewer
    if (this.scene.selectionManager.numberOfSelectedItems === 0) {
      this.sceneGraphTree.deselect_all(true);
    }
  }

  /**
   * @param {Object} theJstreeNode
   */
  onSelectedByTreeView(theJstreeNode) {
    this.collectPartJstreeNodes(theJstreeNode).forEach(thePartJstreeNode => {
      const aSceneNode = /** @type {cadex.ModelPrs_SceneNode|undefined} */(thePartJstreeNode.data.sceneNode);
      if (aSceneNode) {
        this.scene.selectionManager.selectNode(aSceneNode, /*theBreakSelection*/false, /*theDispatchEvent*/false);
      }
    });
  }

  /**
   * @param {Object} theJstreeNode
   */
  onDeselectedByTreeView(theJstreeNode) {
    this.collectPartJstreeNodes(theJstreeNode).forEach(thePartJstreeNode => {
      const aSceneNode = /** @type {cadex.ModelPrs_SceneNode|undefined} */(thePartJstreeNode.data.sceneNode);
      if (aSceneNode) {
        this.scene.selectionManager.deselectNode(aSceneNode, /*theDispatchEvent*/ false);
      }
    });
  }

  onDeselectedAllByTreeView() {
    this.scene.selectionManager.deselectAll(false);
  }

  /**
   * @param {Object} theJstreeNode
   * @param {boolean|undefined} theDisplayed
   */
  async onDisplayedChangedByTreeView(theJstreeNode, theDisplayed) {
    if (theDisplayed === undefined) {
      return;
    }
    this.collectPartJstreeNodes(theJstreeNode).forEach(thePartJstreeNode => {
      if (thePartJstreeNode.data.sceneNode) {
        thePartJstreeNode.data.sceneNode.visibilityMode = theDisplayed ? cadex.ModelPrs_VisibilityMode.Visible : cadex.ModelPrs_VisibilityMode.Hidden;
      }
    });
    await this.scene.update();
  }

  /**
   * @private
   * @param {Object} theJstreeNode
   * @returns {Array<Object>}
   */
  collectPartJstreeNodes(theJstreeNode) {
    if (theJstreeNode.type === 'part') {
      return [theJstreeNode];
    } else {
      return theJstreeNode.children_d.reduce((thePartNodes, theChildId) => {
        const aChild = this.sceneGraphTree.get_node(theChildId);
        if (aChild.type === 'part') {
          thePartNodes.push(aChild);
        }
        return thePartNodes;
      }, []);
    }
  }
}

const aTreeViewExample = new TreeViewExample();

initModelSelector('as1-oc-214.stp', aTreeViewExample.loadAndDisplayModel.bind(aTreeViewExample));
