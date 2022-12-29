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

/* eslint-disable require-atomic-updates */

import { fetchFile, initModelSelector, modelUrl, updateSceneSmoothly } from '../assets/js/helpers.mjs';

import cadex from '@cadexchanger/web-toolkit';

/* global $ */


/**
 * Interface for additional 'treeId' property.
 * @typedef CustomSGESceneNode
 * @property {string} [sgeTreeId]
 */

/**
 * Interface for additional properties of PMI scene nodes.
 * @typedef CustomPMISceneNode
 * @property {string} [pmiTreeId]
 * @property {string} name
 * @property {string} type
 * @property {cadex.ModelData_Shape[]} [associatedShapes]
 * @property {cadex.ModelPrs_SelectionItem} [associatedShapesSelection]
 */

/**
 * @template T
 * @typedef {Array<{groupId: T, nodes: Array<cadex.ModelPrs_SceneNode & CustomPMISceneNode>}>} GroupedPMIData
 */

/**
 * @typedef {Object} PMISceneData
 * @property {Array<cadex.ModelPrs_SceneNode & CustomPMISceneNode>} sceneNodes
 * @property {GroupedPMIData<string>} sceneNodesByType
 * @property {GroupedPMIData<cadex.ModelData_PMISavedView>} sceneNodesBySavedViews
 */

/**
 * @typedef JstreeSGENodeData
 * @property {cadex.ModelData_SceneGraphElement} sge
 * @property {cadex.ModelData_PMITable | null} pmiTable
 * @property {cadex.ModelPrs_SceneNode & CustomSGESceneNode} sceneNode
 * @property {cadex.ModelPrs_SceneNode & CustomSGESceneNode} [representationSceneNode]
 * @property {PMISceneData} [pmiSceneData]
 */

/**
 * @typedef JstreeSGENode
 * @property {string} text
 * @property {string} type
 * @property {JstreeSGENodeData} data
 */

class PMITreeManager {
  /**
   * @param {cadex.ModelPrs_Scene} theScene
   * @param {cadex.ModelPrs_ViewPort} theViewport
   * @param {any} theJsTreeConfig
   */
  constructor(theScene, theViewport, theJsTreeConfig) {
    this.scene = theScene;
    this.viewport = theViewport;

    // Initialize jsTree library used for visualizing tree structure (see https://www.jstree.com/)
    $('#file-pmi-elements').jstree(theJsTreeConfig)
      .on('select_node.jstree', async (_theEvent, theData) => {
        const aNodeData = theData.node?.data;
        if (aNodeData && aNodeData.sceneNode) {
          this.scene.selectionManager.selectNode(aNodeData.sceneNode, /*break selection*/ false);
        }
      })
      .on('deselect_all.jstree', () => {
        this.pmiSceneData?.sceneNodes.forEach((theNode) => this.scene.selectionManager.deselectNode(theNode));
      });

    this.pmiTree = $('#file-pmi-elements').jstree(true);

    this.savedViewsDropDown = /** @type {HTMLSelectElement} */(document.getElementById('file-pmi-saved-views-select'));
    this.savedViewsDropDown.onchange = this.onSavedViewChanged.bind(this);

    /** @type {PMISceneData|null} */
    this.pmiSceneData = null;
    this.sgeNodeTransformation = new cadex.ModelData_Transformation();

    this.pmiSceneNodeFactory = new cadex.ModelPrs_SceneNodeFactory();
    this.pmiSceneNodeAppearance = new cadex.ModelData_Appearance(new cadex.ModelData_ColorObject());

    this.clear();
  }

  reset() {
    // Recreate factory to release data cache stored by factory.
    this.pmiSceneNodeFactory = new cadex.ModelPrs_SceneNodeFactory();
    this.clear();
  }

  /**
   * Loads PMI data items and convert it to scene nodes tree.
   * @param {cadex.ModelData_PMITable} thePMITable
   * @param {cadex.ModelData_BRepRepresentation} [theBrepRep]
   * @param {cadex.ModelPrs_SceneNode} [theBRepRepNode]
   * @return {Promise<PMISceneData>}
   */
  async convertPMITable(thePMITable, theBrepRep, theBRepRepNode) {
    const aPMIDataItems = await thePMITable.pmiDataItems();
    /** @type {Map<cadex.ModelData_PMIGraphicalElement, cadex.ModelPrs_SceneNode & CustomPMISceneNode>} */
    const aGraphicalElementToSceneNodeMap = new Map();
    /** @type Map<string, Array<cadex.ModelPrs_SceneNode & CustomPMISceneNode>> */
    const aSceneNodesByTypeMap = new Map();
    /** @type Map<cadex.ModelData_PMIData, Array<cadex.ModelData_Shape>> */
    const aPMIAssociations = new Map();
    if (theBrepRep) {
      for (const aShape of theBrepRep.subshapes()) {
        for (const aPMIData of theBrepRep.pmiData(aShape)) {
          let aPMIDataShapes = aPMIAssociations.get(aPMIData);
          if (!aPMIDataShapes) {
            aPMIDataShapes = [];
            aPMIAssociations.set(aPMIData, aPMIDataShapes);
          }
          aPMIDataShapes.push(aShape);
        }
      }
    }

    const anAllPMISceneNodes = aPMIDataItems.map((thePMIData) => {
      let aNode;
      if (thePMIData.graphicalElement) {
        aNode = /** @type {cadex.ModelPrs_SceneNode & CustomPMISceneNode} */(this.pmiSceneNodeFactory.createNodeFromPMIGraphicalElement(thePMIData.graphicalElement));
        aNode.appearance = this.pmiSceneNodeAppearance;
        aGraphicalElementToSceneNodeMap.set(thePMIData.graphicalElement, aNode);
      } else {
        aNode = /** @type {cadex.ModelPrs_SceneNode & CustomPMISceneNode} */(new cadex.ModelPrs_SceneNode());
      }
      aNode.name = thePMIData.name || 'Unnamed';
      aNode.type = Object.keys(cadex.ModelData_PMIType).find(key => cadex.ModelData_PMIType[key] === thePMIData.type) || 'Undefined';
      const anAssociations = aPMIAssociations.get(thePMIData);
      aNode.associatedShapes = anAssociations;
      if (anAssociations && theBRepRepNode) {
        aNode.associatedShapesSelection = new cadex.ModelPrs_SelectionItem(theBRepRepNode, anAssociations.map((theShape) => new cadex.ModelPrs_SelectedShapeEntity(theShape)));
      }
      let aSimilarNodes = aSceneNodesByTypeMap.get(aNode.type);
      if (!aSimilarNodes) {
        aSimilarNodes = [];
        aSceneNodesByTypeMap.set(aNode.type, aSimilarNodes);
      }
      aSimilarNodes.push(aNode);
      return aNode;
    });

    /** @type {GroupedPMIData<string>} */
    const aSceneNodesByType = Array.from(aSceneNodesByTypeMap, ([groupId, nodes]) => ({ groupId, nodes }))
      .sort((a, b) => a.groupId.localeCompare(b.groupId));

    const aSavedViews = await thePMITable.views();
    /** @type {GroupedPMIData<cadex.ModelData_PMISavedView>} */
    const aSceneNodesBySavedViews = aSavedViews.map((theSavedView) => {
      const aSceneNodes = [];
      for (const anElement of theSavedView.graphicalElements()) {
        const aSceneNode = aGraphicalElementToSceneNodeMap.get(anElement);
        if (aSceneNode) {
          aSceneNodes.push(aSceneNode);
        }
      }
      return {
        groupId: theSavedView,
        nodes: aSceneNodes,
      };
    });

    return {
      sceneNodes: anAllPMISceneNodes,
      sceneNodesByType: aSceneNodesByType,
      sceneNodesBySavedViews: aSceneNodesBySavedViews,
    };
  }

  /**
   * @param {JstreeSGENode} theNode
   */
  async loadSGENodePMI(theNode) {
    this.clear(false);

    const aNodeData = theNode.data;
    const aSGENodeTransformation = aNodeData.sceneNode.combinedTransformation;
    if (aSGENodeTransformation) {
      this.sgeNodeTransformation.copy(aSGENodeTransformation);
    } else {
      this.sgeNodeTransformation.makeIdentity();
    }
    if (aNodeData.pmiTable) {
      if (!aNodeData.pmiSceneData) {
        let aBRepRep;
        let aBRepRepNode;
        if (aNodeData.representationSceneNode && aNodeData.sge instanceof cadex.ModelData_Part) {
          aBRepRep = aNodeData.sge.brepRepresentation();
          if (aBRepRep) {
            aBRepRepNode = aNodeData.representationSceneNode;
          }
        }
        aNodeData.pmiSceneData = await this.convertPMITable(aNodeData.pmiTable, aBRepRep, aBRepRepNode);
        aNodeData.pmiSceneData.sceneNodes.forEach((theNode) => aNodeData.sceneNode.addChildNode(theNode));
      }
      this.pmiSceneData = aNodeData.pmiSceneData;

      const aSGNode = this.pmiTree.create_node(null, {
        text: theNode.text,
        type: theNode.type,
        data: aNodeData,
      });

      // Feed PMI elements tree
      this.pmiSceneData.sceneNodesByType.forEach((theGroup) => {
        const anPMITypeGroupTreeNode = this.pmiTree.create_node(aSGNode, {
          text: theGroup.groupId,
          type: 'pmi',
          data: {
            sceneNodes: theGroup.nodes,
          }
        });

        theGroup.nodes.forEach((theNode) => {
          const aPMINodeId = this.pmiTree.create_node(anPMITypeGroupTreeNode, {
            text: theNode.name,
            type: 'pmi-element',
            data: {
              sceneNode: theNode,
            }
          });
          theNode.pmiTreeId = aPMINodeId;
        });
      });

      // Feed PMI Saved Views dropdown
      const anAllOption = document.createElement('option');
      anAllOption.text = 'All (auto created)';
      this.savedViewsDropDown.add(anAllOption);

      this.pmiSceneData.sceneNodesBySavedViews.forEach((theGroup) => {
        const anOption = document.createElement('option');
        anOption.text = theGroup.groupId.name || 'Unnamed';
        this.savedViewsDropDown.add(anOption);
      });
      this.savedViewsDropDown.selectedIndex = -1;
    } else {
      this.pmiTree.create_node(null, {
        text: 'There is no PMI table available',
        type: 'pmi'
      });
      // Clean up dropdown
      while (this.savedViewsDropDown.options.length > 0) {
        this.savedViewsDropDown.remove(0);
      }
    }

    this.pmiTree.open_all(null, 0);
  }

  onSavedViewChanged() {
    if (!this.pmiSceneData) {
      return;
    }
    if (this.savedViewsDropDown.selectedIndex === 0) {
      this.pmiSceneData.sceneNodes.forEach((theNode) => {
        theNode.visibilityMode = cadex.ModelPrs_VisibilityMode.Visible;
        this.pmiTree.enable_node(theNode.pmiTreeId);
      });
    } else if (this.savedViewsDropDown.selectedIndex > 0) {

      this.pmiSceneData.sceneNodes.forEach((theNode) => {
        theNode.visibilityMode = cadex.ModelPrs_VisibilityMode.Hidden;
        this.pmiTree.disable_node(theNode.pmiTreeId);
      });

      const aSelectedViewData = this.pmiSceneData.sceneNodesBySavedViews[this.savedViewsDropDown.selectedIndex - 1];
      aSelectedViewData.nodes.forEach((theNode) => {
        this.pmiTree.enable_node(theNode.pmiTreeId);
        theNode.visibilityMode = cadex.ModelPrs_VisibilityMode.Visible;
      });
      const aSavedViewCamera = aSelectedViewData.groupId.camera;
      if (aSavedViewCamera) {
        this.viewport.camera.set(
          aSavedViewCamera.location.transformed(this.sgeNodeTransformation),
          aSavedViewCamera.targetPoint.transformed(this.sgeNodeTransformation),
          aSavedViewCamera.upDirection.transformed(this.sgeNodeTransformation),
        );
      }
    }
    this.scene.update();
  }

  /**
   * @param {boolean} [theToAddNoteNode]
   */
  clear(theToAddNoteNode = true) {
    const aTreeRoot = this.pmiTree.get_node('#');
    aTreeRoot.children.forEach((theRoot) => this.pmiTree.delete_node(theRoot));
    while (this.savedViewsDropDown.options.length > 0) {
      this.savedViewsDropDown.remove(0);
    }
    if (this.pmiSceneData) {
      this.pmiSceneData.sceneNodes.forEach((thePMISceneNode) => {
        thePMISceneNode.visibilityMode = cadex.ModelPrs_VisibilityMode.Hidden;
      });
      this.pmiSceneData = null;
    }
    if (theToAddNoteNode) {
      this.pmiTree.create_node(null, { text: 'Select tree node to see PMI data', type: 'pmi' });
    }
  }
}

class SceneGraphToTreeConverter extends cadex.ModelData_SceneGraphElementVisitor {
  /**
   * @param {any} theJsTree
   * @param {string} theRootNodeId
   * @param {cadex.ModelData_RepresentationMask} theRepMask
   */
  constructor(theJsTree, theRootNodeId, theRepMask) {
    super();
    this.jstree = theJsTree;
    this.treeNodesStack = [theRootNodeId];
    /** @type {Array<cadex.ModelPrs_SceneNode & CustomSGESceneNode>} */
    this.sceneNodesStack = [new cadex.ModelPrs_SceneNode()];
    /** @type {cadex.ModelData_Instance|null} */
    this.lastInstance = null;
    this.sceneNodeFactory = new cadex.ModelPrs_SceneNodeFactory();
    this.repMask = theRepMask;
  }
  currentTreeNode() {
    return this.treeNodesStack[this.treeNodesStack.length - 1];
  }
  currentSceneNode() {
    return this.sceneNodesStack[this.sceneNodesStack.length - 1];
  }

  /**
   * @param {!cadex.ModelData_SceneGraphElement} theElement
   * @param {boolean} theAddToStack
   * @returns {cadex.ModelPrs_SceneNode & CustomSGESceneNode}
   */
  addSceneNode(theElement, theAddToStack) {
    const aSceneNode = /** @type {cadex.ModelPrs_SceneNode & CustomSGESceneNode} */(this.sceneNodeFactory.createNodeFromSceneGraphElement(theElement));
    this.currentSceneNode().addChildNode(aSceneNode);
    if (theAddToStack) {
      this.sceneNodesStack.push(aSceneNode);
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
      aRepresentationNode = /** @type {cadex.ModelPrs_SceneNode & CustomSGESceneNode}> */(this.sceneNodeFactory.createNodeFromRepresentation(aRepresentation));
      aPartNode.addChildNode(aRepresentationNode);
    }

    const aSceneNode = anInstanceNode || aPartNode;

    /** @type {JstreeSGENode} */
    const aTreeItem = {
      text: this.lastInstance?.name || thePart.name || 'Unnamed Part',
      type: 'part',
      data: {
        sge: this.lastInstance || thePart,
        sceneNode: aSceneNode,
        representationSceneNode: aRepresentationNode,
        pmiTable: this.lastInstance?.pmi || thePart.pmi,
      },
    };
    const aNodeId = this.jstree.create_node(this.currentTreeNode(), aTreeItem);
    aSceneNode.sgeTreeId = aNodeId;
    if (aRepresentationNode) {
      aRepresentationNode.sgeTreeId = aNodeId;
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
    this.sceneNodesStack.pop();
  }
  /**
   * @override
   * @param {!cadex.ModelData_Assembly} theAssembly
   */
  visitAssemblyEnter(theAssembly) {
    const anInstanceNode = this.lastInstance && this.currentSceneNode();
    let anAssemblyNode = this.addSceneNode(theAssembly, true);
    const aSceneNode = anInstanceNode || anAssemblyNode;

    /** @type {JstreeSGENode} */
    const aTreeItem = {
      text: this.lastInstance?.name || theAssembly.name || 'Unnamed Assembly',
      type: 'assembly',
      data: {
        sge: this.lastInstance || theAssembly,
        sceneNode: aSceneNode,
        pmiTable: this.lastInstance?.pmi || theAssembly.pmi,
      },
    };
    const aNodeId = this.jstree.create_node(this.currentTreeNode(), aTreeItem);
    aSceneNode.sgeTreeId = aNodeId;
    this.treeNodesStack.push(aNodeId);

    return true;
  }
  /**
   * @override
   * @param {!cadex.ModelData_Assembly} _theAssembly
   */
  visitAssemblyLeave(_theAssembly) {
    this.treeNodesStack.pop();
    this.sceneNodesStack.pop();
  }
}


class PMIViewerExample {
  constructor() {
    // The model
    this.model = new cadex.ModelData_Model();
    // The scene for visualization
    this.scene = new cadex.ModelPrs_Scene();
    // Subscribe to selection events
    this.scene.selectionManager.addEventListener('selectionChanged', this.onSelectionChangedByScene.bind(this));

    // The viewport for visualization. Initializing with default config and element attach to.
    this.viewport = new cadex.ModelPrs_ViewPort({}, /** @type {HTMLElement} */(document.getElementById('file-viewer')));
    // Attach viewport to scene to render content of
    this.viewport.attachToScene(this.scene);

    const aJSTreeConfig = {
      core: {
        multiple: false,
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
      plugins: ['wholerow', 'types']
    };

    this.pmiTreeManager = new PMITreeManager(this.scene, this.viewport, aJSTreeConfig);

    // Initialize jsTree library used for visualizing scenegraph structure (see https://www.jstree.com/)
    $('#file-scenegraph-container').jstree(aJSTreeConfig)
      .on('select_node.jstree', async (_theEvent, theData) => {
        this.pmiTreeManager.loadSGENodePMI(theData.node);
        if (theData.node?.data?.representationSceneNode) {
          this.scene.selectionManager.selectNode(theData.node?.data?.representationSceneNode, false);
        }
      })
      .on('deselect_all.jstree', () => {
        this.pmiTreeManager.clear();
        this.scene.selectionManager.deselectAll(false);
      });

    this.sceneGraphTree = $('#file-scenegraph-container').jstree(true);
  }

  /**
   * @param {string} theModelPath
   * @param {string} theModelName
   */
  async loadAndDisplayModel(theModelPath, theModelName) {
    try {
      // Clean up scene to display new model
      this.pmiTreeManager.reset();
      this.scene.clear();
      await this.scene.update();

      // Remove product structure tree
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
      const aStyle = new cadex.ModelPrs_Style();
      aStyle.highlightAppearance = new cadex.ModelData_Appearance(cadex.ModelData_ColorObject.fromHex(0x66cc00));
      aStyle.boundariesHighlightAppearance = new cadex.ModelData_Appearance(cadex.ModelData_ColorObject.fromHex(0xb2ff65));
      aRootSceneNode.style = aStyle;
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
    theEvent.removed.forEach((theRemoved => {
      const aRemovedObject = /** @type {cadex.ModelPrs_SceneNode & CustomSGESceneNode & CustomPMISceneNode} */(theRemoved.node);
      if (aRemovedObject.sgeTreeId) {
        this.sceneGraphTree.deselect_node(aRemovedObject.sgeTreeId);
      } else if (aRemovedObject.pmiTreeId) {
        this.pmiTreeManager.pmiTree.deselect_node(aRemovedObject.pmiTreeId);
        if (aRemovedObject?.associatedShapesSelection) {
          this.scene.selectionManager.deselect(aRemovedObject.associatedShapesSelection);
        }
      }
    }));
    theEvent.added.forEach((theAdded => {
      const anAddedObject = /** @type {cadex.ModelPrs_SceneNode & CustomSGESceneNode & CustomPMISceneNode} */(theAdded.node);
      if (anAddedObject.sgeTreeId) {
        this.sceneGraphTree.select_node(anAddedObject.sgeTreeId);
      } else if (anAddedObject.pmiTreeId) {
        this.pmiTreeManager.pmiTree.select_node(anAddedObject.pmiTreeId);
        if (anAddedObject.associatedShapesSelection && anAddedObject.combinedVisibilityMode === cadex.ModelPrs_VisibilityMode.Visible) {
          this.scene.selectionManager.select(anAddedObject.associatedShapesSelection, false);
        }
      }
    }));
    // Handle deselectAll on click on empty space on the viewer
    if (this.scene.selectionManager.numberOfSelectedItems === 0) {
      this.sceneGraphTree.deselect_all(true);
      this.pmiTreeManager.pmiTree.deselect_all(true);
      this.scene.selectionManager.unhighlightAll();
    }
  }
}

const aPMIViewerExample = new PMIViewerExample();

initModelSelector('nist_ftc_08_asme1_ap242.stp', aPMIViewerExample.loadAndDisplayModel.bind(aPMIViewerExample), (theModel) => !!theModel.hasPMI);
