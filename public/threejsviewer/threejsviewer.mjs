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

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import WEBGL from 'three/examples/jsm/capabilities/WebGL.js';


// Initialize threejs scene (see also https://threejs.org/examples/?q=phon#webgl_materials_variations_phong)
if (WEBGL.isWebGLAvailable() === false) {
  document.body.appendChild(WEBGL.getWebGLErrorMessage());
}


class SceneGraphToTreejsConverter extends cadex.ModelData_SceneGraphElementVisitor {
  /**
   * @param {THREE.Object3D} theRootObject
   * @param {cadex.ModelData_RepresentationMask|string} theRepSelector
   * @param {cadex.ModelData_Appearance} [theDefaultAppearance]
   */
  constructor(theRootObject, theRepSelector, theDefaultAppearance = new cadex.ModelData_Appearance(new cadex.ModelData_ColorObject(0.5, 0.5, 0.5))) {
    super();
    /** @type {Array<THREE.Object3D>} */
    this.objectStack = [theRootObject];
    /** @type {Array<cadex.ModelData_Appearance>} */
    this.appearancesStack = [theDefaultAppearance];
    /** @type {Map<cadex.ModelData_PolyVertexSet, THREE.BufferGeometry>} */
    this.geometryCache = new Map();
    this.representationSelector = theRepSelector;
  }
  /**
   * @returns {THREE.Object3D}
   */
  currentNode() {
    return this.objectStack[this.objectStack.length - 1];
  }

  /**
   * @returns {cadex.ModelData_Appearance}
   */
  currentAppearance() {
    return this.appearancesStack[this.appearancesStack.length - 1];
  }
  /**
   * @override
   * @param {cadex.ModelData_Part} thePart
   */
  async visitPart(thePart) {
    const aRep = thePart.representation(this.representationSelector);
    if (aRep) {
      let anApp = this.currentAppearance();
      if (thePart.appearance) {
        anApp = anApp.clone().combineWith(thePart.appearance);
      }
      const aConverter = new RepresentationToTreejsConverter(anApp, this.geometryCache);
      await aRep.accept(aConverter);
      if (aConverter.result) {
        this.currentNode().add(aConverter.result);
      }
    }
  }

  /**
   * @override
   * @param {!cadex.ModelData_Instance} theInstance
   */
  visitInstanceEnter(theInstance) {
    const anInstanceNode = new THREE.Group();
    const aTransformation = new THREE.Matrix4().fromArray(theInstance.transformation.elements);
    anInstanceNode.applyMatrix4(aTransformation);
    this.currentNode().add(anInstanceNode);
    this.objectStack.push(anInstanceNode);
    const anApp = theInstance.appearance;
    if (anApp) {
      this.appearancesStack.push(this.currentAppearance().copyAndCombineWith(anApp));
    }
    return true;
  }

  /**
   * @override
   * @param {!cadex.ModelData_Instance} theInstance
   */
  visitInstanceLeave(theInstance) {
    this.objectStack.pop();
    if (theInstance.appearance) {
      this.appearancesStack.pop();
    }
  }

  /**
   * @override
   * @param {!cadex.ModelData_Assembly} _theAssembly
   */

  visitAssemblyEnter(_theAssembly) {
    return true;
  }

  /**
   * @override
   * @param {!cadex.ModelData_Assembly} _theAssembly
   */
  visitAssemblyLeave(_theAssembly) {
  }
}

class RepresentationToTreejsConverter extends cadex.ModelData_RepresentationVisitor {
  /**
   * @param {cadex.ModelData_Appearance} thePartAppearance
   * @param {Map<cadex.ModelData_PolyVertexSet, THREE.BufferGeometry|null>} theGeometryCache
   */
  constructor(thePartAppearance, theGeometryCache) {
    super();
    /** @type {THREE.Object3D|null} */
    this.result = null;
    this.partAppearance = thePartAppearance;
    this.geometryCache = theGeometryCache;
  }

  /**
   * Converts PVS to three.js object.
   * @param {cadex.ModelData_PolyVertexSet|null|undefined} thePVS
   * @param {boolean} [theClosed]
   * @returns {THREE.Object3D|null}
   */
  convertPVS(thePVS, theClosed = false) {
    if (!thePVS) {
      return null;
    }
    let aGeometry;
    if (this.geometryCache.has(thePVS)) {
      aGeometry = this.geometryCache.get(thePVS);
    } else {
      aGeometry = createThreejsGeometry(thePVS);
      this.geometryCache.set(thePVS, aGeometry);
    }
    if (!aGeometry) {
      return null;
    }
    /** @type {Array<cadex.ModelData_Appearance>} */
    let anAppearances;

    /**
     * @param {cadex.ModelData_Appearance|null|undefined} theApp
     * @return {!cadex.ModelData_Appearance}
     */
    const combineAppearance = (theApp) => (theApp ? this.partAppearance.copyAndCombineWith(theApp) : this.partAppearance);

    if (thePVS instanceof cadex.ModelData_MultiAppearanceIndexedTriangleSet
      || thePVS instanceof cadex.ModelData_MultiAppearanceIndexedPolyLineSet
      || thePVS instanceof cadex.ModelData_MultiAppearancePolyPointSet) {
      anAppearances = thePVS.appearances.map(combineAppearance);
    } else {
      anAppearances = [combineAppearance(thePVS.appearance)];
    }

    //create material and resulting presentation
    if (thePVS instanceof cadex.ModelData_IndexedTriangleSet) {
      const aMaterials = anAppearances.map((theApp) => {
        const aMaterial = new THREE.MeshPhongMaterial();
        if (!theClosed) {
          aMaterial.side = THREE.DoubleSide;
        }
        if (theApp.material) {
          setDiffuseColor(theApp.material.diffuseColor, aMaterial);
          aMaterial.specular.setRGB(theApp.material.specularColor.r, theApp.material.specularColor.g, theApp.material.specularColor.b);
          aMaterial.emissive.setRGB(theApp.material.emissiveColor.r, theApp.material.emissiveColor.g, theApp.material.emissiveColor.b);
          aMaterial.shininess = theApp.material.shininess;
        } else if (theApp.genericColor) {
          setDiffuseColor(theApp.genericColor, aMaterial);
        }
        return aMaterial;
      });
      return new THREE.Mesh(aGeometry, aMaterials);
    } else if (thePVS instanceof cadex.ModelData_PolyLineSet) {
      const aMaterials = anAppearances.map((theApp) => {
        const aMaterial = new THREE.LineBasicMaterial();
        const aDiffuseColor = theApp.material?.diffuseColor || theApp.genericColor;
        if (aDiffuseColor) {
          setDiffuseColor(aDiffuseColor, aMaterial);
        }
        return aMaterial;
      });
      return new THREE.LineSegments(aGeometry, aMaterials);
    } else if (thePVS instanceof cadex.ModelData_PolyPointSet) {
      const aMaterials = anAppearances.map((theApp) => {
        const aMaterial = new THREE.PointsMaterial();
        const aDiffuseColor = theApp.material?.diffuseColor || theApp.genericColor;
        if (aDiffuseColor) {
          setDiffuseColor(aDiffuseColor, aMaterial);
        }
        return aMaterial;
      });
      return new THREE.Points(aGeometry, aMaterials);
    }
    return null;
  }


  /**
   * @override
   * @param {cadex.ModelData_BRepRepresentation} theBRepRep
   */
  async visitBRepRepresentation(theBRepRep) {
    const aBodyList = await theBRepRep.bodyList();
    if (aBodyList.size() === 0) {
      return;
    }
    this.result = new THREE.Group();
    for (const aShape of aBodyList) {
      const aBody = /** @type {cadex.ModelData_Body} */(aShape);
      const aPVS = aBody?.prs?.faces || aBody?.prs?.edges || aBody?.prs?.vertexes;
      const anObj = this.convertPVS(aPVS, aBody.bodyType === cadex.ModelData_BodyType.Solid);
      if (anObj) {
        this.result.add(anObj);
      }
    }
  }

  /**
   * @override
   * @param {cadex.ModelData_PolyRepresentation} thePolyRep
   */
  async visitPolyRepresentation(thePolyRep) {
    const aPolyShapeList = await thePolyRep.polyShapeList();
    if (aPolyShapeList.size() === 0) {
      return;
    }
    this.result = new THREE.Group();
    for (const aPVS of aPolyShapeList) {
      const anObj = this.convertPVS(aPVS);
      if (anObj) {
        this.result.add(anObj);
      }
    }
  }
}

/**
 * Creates three.js buffer geometry from PVS.
 * @param {cadex.ModelData_PolyVertexSet} thePVS
 * @returns {THREE.BufferGeometry|null}
 */
function createThreejsGeometry(thePVS) {
  if (!thePVS.coords?.length) {
    return null;
  }
  const aBufferGeometry = new THREE.BufferGeometry();
  aBufferGeometry.setAttribute('position', new THREE.BufferAttribute(thePVS.coords, 3));
  if (thePVS.colors) {
    aBufferGeometry.setAttribute('color', new THREE.BufferAttribute(thePVS.colors, 3));
  }
  if (thePVS instanceof cadex.ModelData_IndexedTriangleSet) {
    if (thePVS.indexes) {
      aBufferGeometry.setIndex(new THREE.BufferAttribute(thePVS.indexes, 1));
    }
    if (thePVS.normals) {
      aBufferGeometry.setAttribute('normal', new THREE.BufferAttribute(thePVS.normals, 3));
    } else {
      aBufferGeometry.computeVertexNormals();
    }
    if (thePVS.uvCoordinates) {
      aBufferGeometry.setAttribute('uv', new THREE.BufferAttribute(thePVS.uvCoordinates, 2));
    }
  }
  if (thePVS instanceof cadex.ModelData_IndexedPolyLineSet) {
    if (thePVS.indexes) {
      aBufferGeometry.setIndex(new THREE.BufferAttribute(thePVS.indexes, 1));
    }
  }

  if (thePVS instanceof cadex.ModelData_MultiAppearanceIndexedTriangleSet
    || thePVS instanceof cadex.ModelData_MultiAppearanceIndexedPolyLineSet
    || thePVS instanceof cadex.ModelData_MultiAppearancePolyPointSet) {
    const aNumberOfAppearances = thePVS.appearances.length;
    thePVS.groups.forEach((theGroup) => {
      const anAppearanceIndex = theGroup.appearanceIndex;
      if (anAppearanceIndex >= 0 && anAppearanceIndex < aNumberOfAppearances) {
        aBufferGeometry.addGroup(theGroup.start, theGroup.count, theGroup.appearanceIndex);
      }
    });
  } else {
    aBufferGeometry.addGroup(0, Infinity, 0);
  }

  return aBufferGeometry;
}

/**
 * Applies diffuse color to material
 * @param {cadex.ModelData_ColorObject} theColor
 * @param {THREE.MeshPhongMaterial|THREE.LineBasicMaterial|THREE.PointsMaterial} theMaterial
 */
function setDiffuseColor(theColor, theMaterial) {
  theMaterial.color.setRGB(theColor.r, theColor.g, theColor.b);
  theMaterial.opacity = theColor.a;
  if (theColor.a < 1.0) {
    theMaterial.transparent = true;
  }
}

class ThreejsViewerExample {
  constructor() {
    // Create model
    this.model = new cadex.ModelData_Model();

    // Create three.js scene
    this.scene = new THREE.Scene();
    // Element to store sub-tree of objects associated with loaded model
    this.modelNode = new THREE.Object3D();
    this.scene.add(this.modelNode);

    // Setup lights sources
    this.scene.add(new THREE.AmbientLight(0x222222));

    let aDirectionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.7);
    aDirectionalLight.position.set(1, 1, 0).normalize();
    this.scene.add(aDirectionalLight);

    aDirectionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.7);
    aDirectionalLight.position.set(-1, 1, 0).normalize();
    this.scene.add(aDirectionalLight);

    aDirectionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.7);
    aDirectionalLight.position.set(0, -1, 0).normalize();
    this.scene.add(aDirectionalLight);

    // Set up WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(new THREE.Color('white'));

    // Set up camera
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 2000000);
    this.camera.position.set(-1000, 1000, 1000);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.scheduleRender();
    }, false);

    const aContainer = /** @type {HTMLElement} */(document.getElementById('file-viewer'));
    aContainer.appendChild(this.renderer.domElement);

    // Set up stats.js (https://github.com/mrdoob/stats.js/)
    // eslint-disable-next-line new-cap
    this.stats = Stats();
    aContainer.appendChild(this.stats.dom);
    this.stats.dom.style.top = 'unset';
    this.stats.dom.style.bottom = '0px';

    this.lastRenderRequestId = undefined;
    this.render = this.render.bind(this);

    // Set up camera and mouse controller
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('change', this.scheduleRender.bind(this));
    this.controls.update();
  }

  /**
   * @param {string} theModelPath
   */
  async loadAndDisplayModel(theModelPath) {

    // Remove previous model items
    this.modelNode.remove(...this.modelNode.children);

    try {
      // Model uses multiple external files, so requires provider to fetch it.
      /** @type {cadex.ModelData_CDXFBBufferProvider} */
      const dataLoader = (theModelPath, theObjId, theProgressScope) => {
        return fetchFile(modelUrl(theModelPath) + '/' + theObjId, theProgressScope);
      };

      // Load model by URL.
      const aLoadResult = await this.model.loadFile(theModelPath, dataLoader, false /*append roots*/);
      console.log(`${theModelPath} is loaded\n`, aLoadResult);

      // Convert model ot three.js graph
      const aThreejsConverter = new SceneGraphToTreejsConverter(this.modelNode, cadex.ModelData_RepresentationMask.ModelData_RM_Any);
      await this.model.accept(aThreejsConverter);

      console.log(this.modelNode.toJSON());

      // Fit camera to scene
      // For more details see https://discourse.threejs.org/t/camera-zoom-to-fit-object/936/3
      const aSceneBBox = new THREE.Box3().setFromObject(this.scene);
      const aBBoxCenter = aSceneBBox.getCenter(new THREE.Vector3());
      const size = aSceneBBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = this.camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 4 * Math.tan(fov * 2)) * 1.10;

      this.camera.position.sub(this.controls.target).setLength(cameraZ).add(aBBoxCenter);
      this.camera.updateProjectionMatrix();

      // set camera to rotate around center of loaded object
      this.controls.target = aBBoxCenter;
      this.controls.update();
    }
    catch (theErr) {
      console.log('Unable to load and display model: ', theErr);
      alert(`Unable to load model "${theModelPath}" [${/** @type {Error}*/(theErr).message}]`);
    }
  }

  scheduleRender() {
    if (this.lastRenderRequestId === undefined) {
      this.lastRenderRequestId = requestAnimationFrame(this.render);
    }
  }

  render() {
    this.lastRenderRequestId = undefined;
    this.stats.begin();
    this.renderer.render(this.scene, this.camera);
    this.stats.end();
  }
}

const aThreejsViewerExample = new ThreejsViewerExample();

initModelSelector('Tisno.fbx', aThreejsViewerExample.loadAndDisplayModel.bind(aThreejsViewerExample));
