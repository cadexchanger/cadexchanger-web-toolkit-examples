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
 * Interface for additional 'sge' property.
 * @typedef CustomSceneNode
 * @property {cadex.ModelData_SceneGraphElement} [sge]
 */

/**
 * @enum {number}
 */
const MeasurementMode = {
  TwoPointDistance: 0,
  ThreePointAngle: 1,
};

class SelectedPointsCollector extends cadex.ModelPrs_SelectedEntityVisitor {
  constructor() {
    super();
    /** @type {Array<cadex.ModelData_Point>} */
    this.points = [];
  }
  /**
   * @override
   * @param {cadex.ModelPrs_SelectedPolyShapeEntity} _thePolyShapeEntity
   */
  visitPolyShapeEntity(_thePolyShapeEntity) {
  }
  /**
   * @override
   * @param {cadex.ModelPrs_SelectedPolyVertexEntity} thePolyVertexEntity
   */
  visitPolyVertexEntity(thePolyVertexEntity) {
    this.points.push(/** @type {cadex.ModelData_Point} */(thePolyVertexEntity.polyShape.coordinate(thePolyVertexEntity.vertexIndex)));
  }
  /**
   * @override
   * @param {cadex.ModelPrs_SelectedShapeEntity} theShapeEntity
   */
  visitShapeEntity(theShapeEntity) {
    this.points.push(/** @type {cadex.ModelData_Vertex} */(theShapeEntity.shape).point.clone());
  }
}

class MeasurementGeometryVisitor extends cadex.ModelPrs_GeometryVisitor {
  constructor() {
    super();
    /** @type {cadex.ModelPrs_Measurement|null} */
    this.measurement = null;
  }
  /**
   * @override
   * @param {!cadex.ModelData_Body} _theBody
   * @param {!cadex.ModelData_BRepRepresentation|undefined} _theRep
   */
  visitBody(_theBody, _theRep) { }
  /**
   * @override
   * @param {!cadex.ModelData_BRepRepresentation} _theBRep
   */
  visitBRepRepresentation(_theBRep) { }
  /**
   * @override
   * @param {!cadex.ModelData_PolyVertexSet} _thePVS
   */
  visitPolyVertexSet(_thePVS) { }
  /**
   * @override
   * @param {!cadex.ModelData_PolyRepresentation} _theRep
   */
  visitPolyRepresentation(_theRep) { }
  /**
   * @override
   * @param {!cadex.ModelData_PMIGraphicalElement} _theElement
   */
  visitPMIGraphicalElement(_theElement) { }
  /**
   * @override
   * @param {!cadex.ModelPrs_Measurement} theMeasurement
   */
  visitMeasurement(theMeasurement) {
    this.measurement = theMeasurement;
  }
}

class MeasurementsManager extends cadex.ModelPrs_InputHandler {
  /**
   * @param {cadex.ModelPrs_Scene} theScene
   */
  constructor(theScene) {
    super();
    this.scene = theScene;

    /** @type {Array<cadex.ModelPrs_SceneNode>} */
    this.selectedMeasurements = [];
    /** @type {Array<cadex.ModelData_Point>} */
    this.selectedPoints = [];

    this.measurementMode = MeasurementMode.TwoPointDistance;
    this.fontSize = 10;
    this.lengthUnit = cadex.Base_LengthUnit.Base_LU_Millimeters;
    this.angleUnit = cadex.Base_AngleUnit.Base_AU_Radians;

    this.measurementsFactory = new cadex.ModelPrs_MeasurementFactory();
    this.measurementsSceneNodeFactory = new cadex.ModelPrs_SceneNodeFactory();

    this.measurementsRootNode = new cadex.ModelPrs_SceneNode();
    this.measurementsRootNode.displayMode = cadex.ModelPrs_DisplayMode.Shaded;
    this.measurementsRootNode.selectionMode = cadex.ModelPrs_SelectionMode.Node;
    this.measurementsRootNode.appearance = new cadex.ModelData_Appearance(cadex.ModelData_ColorObject.fromHex(0x000));
    this.scene.addRoot(this.measurementsRootNode);
    this.scene.update();

    this.scene.selectionManager.addEventListener('selectionChanged', this.checkSelectedItems.bind(this));

    this.initSelectors();
  }

  /**
   * @override
   */
  get isAcceptKeyEvents() {
    return true;
  }

  clear() {
    // To release internal data previously created, the factories are just re-created
    this.measurementsFactory = new cadex.ModelPrs_MeasurementFactory();
    this.measurementsSceneNodeFactory = new cadex.ModelPrs_SceneNodeFactory();
    this.measurementsRootNode.removeChildNodes();
  }

  /**
   * @param {cadex.ModelPrs_SelectionChangedEvent} theEvent
   */
  checkSelectedItems(theEvent) {
    theEvent.added.forEach((theSelectedItem) => {
      if (theSelectedItem.isWholeSelectedNode) {
        this.selectedMeasurements.push(theSelectedItem.node);
      } else {
        const aSelectedPointsCollector = new SelectedPointsCollector();
        for (const aSelectedEntity of theSelectedItem.entities()) {
          aSelectedEntity.accept(aSelectedPointsCollector);
        }
        aSelectedPointsCollector.points.forEach((thePoint) => {
          const aTransformation = theSelectedItem.node.combinedTransformation;
          if (aTransformation) {
            thePoint.transform(theSelectedItem.node.combinedTransformation);
          }
          this.selectedPoints.push(thePoint);
        });
      }
    });
    theEvent.removed.forEach((theSelectedItem) => {
      if (theSelectedItem.isWholeSelectedNode) {
        const anIndex = this.selectedMeasurements.findIndex((theNode) => theNode === theSelectedItem.node);
        this.selectedMeasurements.splice(anIndex, 1);
      } else {
        const aSelectedPointsCollector = new SelectedPointsCollector();
        for (const aSelectedEntity of theSelectedItem.entities()) {
          aSelectedEntity.accept(aSelectedPointsCollector);
        }
        aSelectedPointsCollector.points.forEach((thePoint) => {
          const aTransformation = theSelectedItem.node.combinedTransformation;
          if (aTransformation) {
            thePoint.transform(theSelectedItem.node.combinedTransformation);
          }
          const anIndex = this.selectedPoints.findIndex((theSelectedPoint) => theSelectedPoint.isEqual(thePoint));
          if (anIndex !== -1) {
            this.selectedPoints.splice(anIndex, 1);
          }
        });
      }
    });

    if (this.measurementMode === MeasurementMode.TwoPointDistance && this.selectedPoints.length === 2) {
      this.createDistanceMeasurement(this.selectedPoints[0], this.selectedPoints[1]);
    }
    if (this.measurementMode === MeasurementMode.ThreePointAngle && this.selectedPoints.length === 3) {
      this.createAngleMeasurement(this.selectedPoints[0], this.selectedPoints[1], this.selectedPoints[2]);
    }
  }

  /**
   * @param {cadex.ModelData_Point} thePoint1
   * @param {cadex.ModelData_Point} thePoint2
   */
  async createDistanceMeasurement(thePoint1, thePoint2) {
    const aDistanceMeasurement = this.measurementsFactory.createDistanceFromPoints(thePoint1, thePoint2);
    if (!aDistanceMeasurement) {
      return;
    }
    this.scene.selectionManager.deselectAll();

    // find the extension line direction
    // the main idea is to use direction aligned with vector from scene bbox center to measurement points.
    const aBBoxCenter = this.scene.boundingBox.getCenter();

    // use center of measurement reference point for extension line direction
    const anExtensionLineDirection = new cadex.ModelData_Vector().addVectors(thePoint1, thePoint2).multiplyScalar(0.5).subtract(aBBoxCenter).normalize();

    // next try to align annotation direction with X, Y, Z axes.
    const aP1P2Direction = new cadex.ModelData_Vector().subtractVectors(thePoint1, thePoint2).normalize();
    const aDirXAbs = Math.abs(anExtensionLineDirection.x);
    const aDirYAbs = Math.abs(anExtensionLineDirection.y);
    const aDirZAbs = Math.abs(anExtensionLineDirection.z);
    if (aDirZAbs && aDirZAbs >= aDirXAbs && aDirZAbs >= aDirYAbs) {
      if (Math.abs(aP1P2Direction.x) < 1e-5 && Math.abs(aP1P2Direction.y) < 1e-5) {
        // degenerate case, choose X axis
        anExtensionLineDirection.z = 0;
      } else {
        anExtensionLineDirection.x = 0;
      }
      anExtensionLineDirection.y = 0;
    } else if (aDirXAbs > 1e-5 && aDirXAbs >= aDirYAbs && aDirXAbs >= aDirZAbs) {
      if (Math.abs(aP1P2Direction.y) < 1e-5 && Math.abs(aP1P2Direction.z) < 1e-5) {
        // degenerate case, choose Z axis
        anExtensionLineDirection.x = 0;
      } else {
        anExtensionLineDirection.z = 0;
      }
      anExtensionLineDirection.y = 0;
    } else if (aDirYAbs > 1e-5) {
      if (Math.abs(aP1P2Direction.x) < 1e-5 && Math.abs(aP1P2Direction.z) < 1e-5) {
        // degenerate case, choose Z axis
        anExtensionLineDirection.y = 0;
      } else {
        anExtensionLineDirection.z = 0;
      }
      anExtensionLineDirection.x = 0;
    } else {
      // default is Z axis
      anExtensionLineDirection.setCoord(0, 0, 1);
    }

    // orthogonalize extension line direction
    const anOrthogonalizedExtensionLineDirection = cadex.ModelData_Direction.fromXYZ(aP1P2Direction).cross(anExtensionLineDirection).cross(aP1P2Direction);

    // For better UX place measurement label out of model bbox

    // find the max distance between points to BBox boundaries in chosen direction
    const tmp = new cadex.ModelData_Vector();
    const aBBoxMinCorner = this.scene.boundingBox.minCorner;
    const aBBoxMaxCorner = this.scene.boundingBox.maxCorner;
    let anExtensionLineLength = Math.max(
      tmp.subtractVectors(aBBoxMinCorner, thePoint1).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMinCorner, thePoint1).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMinCorner, thePoint1).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMinCorner, thePoint1).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMaxCorner, thePoint1).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMaxCorner, thePoint1).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMaxCorner, thePoint1).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMaxCorner, thePoint1).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMinCorner, thePoint2).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMinCorner, thePoint2).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMinCorner, thePoint2).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMinCorner, thePoint2).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMaxCorner, thePoint2).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMaxCorner, thePoint2).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMaxCorner, thePoint2).dot(anOrthogonalizedExtensionLineDirection),
      tmp.subtractVectors(aBBoxMaxCorner, thePoint2).dot(anOrthogonalizedExtensionLineDirection),
    );

    if (anExtensionLineLength < 0) {
      anExtensionLineLength *= -1;
    }

    // add addition offset for better UX
    anExtensionLineLength += 3 * this.fontSize;

    aDistanceMeasurement.fontSize = this.fontSize;
    aDistanceMeasurement.lengthUnit = this.lengthUnit;
    aDistanceMeasurement.extensionLineDirection = anOrthogonalizedExtensionLineDirection;
    aDistanceMeasurement.extensionLineLength = anExtensionLineLength;
    aDistanceMeasurement.extensionOverhangLength = 0.4 * this.fontSize;

    console.log(`New distance measurement created:\nVertex 1: ${thePoint1}\nVertex 2 ${thePoint2}\nResult: ${aDistanceMeasurement.value}\nRendered text: ${aDistanceMeasurement.toString()}`);

    const aDistanceMeasurementNode = this.measurementsSceneNodeFactory.createNodeFromMeasurement(aDistanceMeasurement);
    this.measurementsRootNode.addChildNode(aDistanceMeasurementNode);
    await this.scene.update();
  }

  /**
   * @param {cadex.ModelData_Point} thePoint1
   * @param {cadex.ModelData_Point} thePoint2
   * @param {cadex.ModelData_Point} thePoint3
   */
  async createAngleMeasurement(thePoint1, thePoint2, thePoint3) {
    const anAngleMeasurement = this.measurementsFactory.createAngleFromPoints(thePoint1, thePoint2, thePoint3);
    if (!anAngleMeasurement) {
      return;
    }
    this.scene.selectionManager.deselectAll();

    anAngleMeasurement.fontSize = this.fontSize;
    anAngleMeasurement.angleUnit = this.angleUnit;
    anAngleMeasurement.extensionLineLength = 100 * this.fontSize;
    anAngleMeasurement.extensionOverhangLength = 0.4 * this.fontSize;

    console.log(`New angle measurement created:\nVertex 1: ${thePoint1}\nVertex 2 ${thePoint2}\nVertex 3 ${thePoint3}\nResult: ${anAngleMeasurement.value}\nRendered text: ${anAngleMeasurement.toString()}`);

    const anAngleMeasurementNode = this.measurementsSceneNodeFactory.createNodeFromMeasurement(anAngleMeasurement);
    this.measurementsRootNode.addChildNode(anAngleMeasurementNode);
    await this.scene.update();
  }

  /**
   * @override
   * @param {!cadex.ModelPrs_KeyboardInputEvent} theEvent
   * @returns {boolean}
   */
  keyDown(theEvent) {
    if (theEvent.code === 'Delete') {
      this.selectedMeasurements.forEach((theNode) => {
        this.measurementsRootNode.removeChildNode(theNode);
      });
      if (this.selectedMeasurements.length > 0) {
        this.selectedMeasurements.length = 0;
        this.scene.update();
      }
      return true;
    }
    return false;
  }

  initSelectors() {
    const aMeasurementsModeSelector = /** @type {HTMLElement} */(document.querySelector('#measurements-mode-selector'));
    const aMeasurementsModeSelect = /** @type {HTMLSelectElement} */(aMeasurementsModeSelector.querySelector('select'));
    const onMeasurementModeChanged = () => {
      this.measurementMode = MeasurementMode[aMeasurementsModeSelect.value];
      aMeasurementsModeSelector.dataset.measurementMode = aMeasurementsModeSelect.value;
    };
    aMeasurementsModeSelect.onchange = onMeasurementModeChanged;
    onMeasurementModeChanged();

    const aLengthUnitsSelect = /** @type {HTMLSelectElement} */(document.querySelector('#length-units-selector>select'));
    Object.keys(cadex.Base_LengthUnit).forEach((theName) => {
      const anOption = document.createElement('option');
      anOption.text = /** @type {RegExpMatchArray} */(theName.match(/.*_([^_]+$)/))[1];
      anOption.value = `${cadex.Base_LengthUnit[theName]}`;
      aLengthUnitsSelect.add(anOption);
    });
    aLengthUnitsSelect.value = `${this.lengthUnit}`;
    aLengthUnitsSelect.onchange = () => {
      this.lengthUnit = parseInt(aLengthUnitsSelect.value);
      this.selectedMeasurements.forEach((theNode) => {
        if (theNode.geometry) {
          const aVisitor = new MeasurementGeometryVisitor();
          theNode.geometry.accept(aVisitor);
          if (aVisitor.measurement instanceof cadex.ModelPrs_LinearMeasurement) {
            aVisitor.measurement.lengthUnit = this.lengthUnit;
          }
          theNode.invalidate();
        }
      });
      this.scene.update();
    };

    const anAngleUnitsSelect = /** @type {HTMLSelectElement} */(document.querySelector('#angle-units-selector>select'));
    Object.keys(cadex.Base_AngleUnit).forEach((theName) => {
      const anOption = document.createElement('option');
      anOption.text = /** @type {RegExpMatchArray} */(theName.match(/.*_([^_]+$)/))[1];
      anOption.value = cadex.Base_AngleUnit[theName];
      anAngleUnitsSelect.add(anOption);
    });
    anAngleUnitsSelect.value = `${this.angleUnit}`;
    anAngleUnitsSelect.onchange = () => {
      this.angleUnit = parseInt(anAngleUnitsSelect.value);
      this.selectedMeasurements.forEach((theNode) => {
        if (theNode.geometry) {
          const aVisitor = new MeasurementGeometryVisitor();
          theNode.geometry.accept(aVisitor);
          if (aVisitor.measurement instanceof cadex.ModelPrs_AngularMeasurement) {
            aVisitor.measurement.angleUnit = this.angleUnit;
          }
          theNode.invalidate();
        }
      });
      this.scene.update();
    };
  }
}

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
    this.sceneNodes[this.sceneNodes.length - 1].addChildNode(aPartNode);

    let aRepresentationNode;
    const aRepresentation = thePart.representation(this.repMask);
    if (aRepresentation) {
      aRepresentationNode = /** @type {cadex.ModelPrs_SceneNode & CustomSceneNode} */(this.sceneNodeFactory.createNodeFromRepresentation(aRepresentation));
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

class MeasurementsExample {
  constructor() {
    // The model
    this.model = new cadex.ModelData_Model();
    // The scene for visualization
    this.scene = new cadex.ModelPrs_Scene();

    // The viewport for visualization. Initializing with default config and element attach to.
    this.viewport = new cadex.ModelPrs_ViewPort({}, /** @type {HTMLElement} */(document.getElementById('file-viewer')));
    // Attach viewport to scene to render content of
    this.viewport.attachToScene(this.scene);

    // Hover and highlighting are disabled by default due performance reasons. Enable it.
    this.viewport.inputManager.isHoverEnabled = true;
    this.viewport.inputManager.pushInputHandler(new cadex.ModelPrs_HighlightingHandler(this.viewport));

    this.measurementsManager = new MeasurementsManager(this.scene);
    this.viewport.inputManager.pushInputHandler(this.measurementsManager);
  }

  /**
   * @param {string} theModelPath
   */
  async loadAndDisplayModel(theModelPath) {
    try {
      // Clean up scene to display new model
      if (this.rootSceneNode) {
        this.scene.removeRoot(this.rootSceneNode);
      }
      this.measurementsManager.clear();
      await this.scene.update();

      // Model uses multiple external files, so requires provider to fetch it.
      /** @type {cadex.ModelData_CDXFBBufferProvider} */
      const dataLoader = (theModelPath, theObjId, theProgressScope) => {
        return fetchFile(modelUrl(theModelPath) + '/' + theObjId, theProgressScope);
      };

      // Load model by URL.
      const aLoadResult = await this.model.loadFile(theModelPath, dataLoader, false /*append roots*/);
      console.log(`${theModelPath} is loaded\n`, aLoadResult);

      // Create visualization graph for model.
      this.rootSceneNode = new cadex.ModelPrs_SceneNode();
      this.rootSceneNode.displayMode = aLoadResult.hasBRepRep ? cadex.ModelPrs_DisplayMode.ShadedWithBoundaries : cadex.ModelPrs_DisplayMode.Shaded;
      this.rootSceneNode.selectionMode = cadex.ModelPrs_SelectionMode.Vertex | cadex.ModelPrs_SelectionMode.PolyVertex;

      let aRepMask = aLoadResult.hasBRepRep ? cadex.ModelData_RepresentationMask.ModelData_RM_BRep : cadex.ModelData_RepresentationMask.ModelData_RM_Poly;
      const aModelConverter = new SceneGraphConverter(aRepMask, this.rootSceneNode);
      await this.model.accept(aModelConverter);
      this.scene.addRoot(this.rootSceneNode);

      // Update scene to apply changes.
      await updateSceneSmoothly(this.scene, this.viewport);

      this.measurementsManager.fontSize = Math.max(this.scene.boundingBox.xRange(), this.scene.boundingBox.yRange(), this.scene.boundingBox.zRange()) / 40;

      // Finally move camera to position when the whole model is in sight
      this.viewport.fitAll();
    }
    catch (theErr) {
      console.error('Unable to load and display model: ', theErr);
      alert(`Unable to load model "${theModelPath}" [${/** @type {Error} */(theErr).message}]`);
    }
  }
}

const aMeasurementsExample = new MeasurementsExample();

initModelSelector('nist_ftc_08_asme1_ap242.stp', aMeasurementsExample.loadAndDisplayModel.bind(aMeasurementsExample));
