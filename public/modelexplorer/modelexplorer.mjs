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

// Use a visitor to feed jsTree
class SceneGraphToTreeConverter extends cadex.ModelData_SceneGraphElementVisitor {
  /**
   * @param {*} theJsTree
   * @param {string} theRootNode
   * @param {string} theTextureBasePath
   */
  constructor(theJsTree, theRootNode, theTextureBasePath) {
    super();
    this.jstree = theJsTree;
    this.nodes = [theRootNode];
    this.textureBasePath = theTextureBasePath;
  }
  currentNode() {
    return this.nodes[this.nodes.length - 1];
  }
  /**
   * @override
   * @param {cadex.ModelData_Part} thePart
   */
  visitPart(thePart) {
    const aTreeItem = {
      text: thePart.name || 'Unnamed Part',
      type: 'part',
      data: {
        sge: thePart,
        textureBasePath: this.textureBasePath
      }
    };
    this.jstree.create_node(this.currentNode(), aTreeItem);
  }
  /**
   * @override
   * @param {cadex.ModelData_Instance} theInstance
   */
  visitInstanceEnter(theInstance) {
    const aTreeItem = {
      text: theInstance.name || 'Unnamed Instance',
      type: 'instance',
      data: {
        sge: theInstance,
        textureBasePath: this.textureBasePath
      }
    };
    const aNode = this.jstree.create_node(this.currentNode(), aTreeItem);
    this.nodes.push(aNode);
    return true;
  }
  /**
   * @override
   * @param {cadex.ModelData_Instance} _theInstance
   */
  visitInstanceLeave(_theInstance) {
    this.nodes.pop();
  }
  /**
   * @override
   * @param {cadex.ModelData_Assembly} theAssembly
   */
  visitAssemblyEnter(theAssembly) {
    const aTreeItem = {
      text: theAssembly.name || 'Unnamed Assembly',
      type: 'assembly',
      data: {
        sge: theAssembly,
        textureBasePath: this.textureBasePath
      }
    };
    const aNode = this.jstree.create_node(this.currentNode(), aTreeItem);
    this.nodes.push(aNode);
    return true;
  }
  /**
   * @override
   * @param {cadex.ModelData_Assembly} _theAssembly
   */
  visitAssemblyLeave(_theAssembly) {
    this.nodes.pop();
  }

}

// Use a visitor to collect information about scenegraph element
class SceneGraphElementFormatter extends cadex.ModelData_SceneGraphElementVisitor {
  /**
   * @param {string} theTextureBasePath
   */
  constructor(theTextureBasePath) {
    super();
    this.info = '<h3>Information</h3>';
    this.textureBasePath = theTextureBasePath;
  }
  /**
   * @param {cadex.ModelData_SceneGraphElement} theElement
   */
  async visitElement(theElement) {
    const generalInfo = formatKeyValue('Uuid', theElement.uuid) + formatKeyValue('Name', theElement.name);
    this.info += formatKeyValue('General', generalInfo);

    this.info += formatKeyValue('Appearance', await formatAppearance(theElement.appearance, this.textureBasePath));

    const aPropsText = await formatPropertyTable(theElement.properties);
    this.info += formatKeyValue('Properties', aPropsText);

    const aPMIText = await formatPMITable(theElement.pmi);
    this.info += formatKeyValue('PMI', aPMIText);
  }
  /**
   * @override
   * @param {cadex.ModelData_Part} thePart
   */
  async visitPart(thePart) {
    await this.visitElement(thePart);
    const aFormatter = new RepresentationFormatter(this.textureBasePath);
    await thePart.acceptRepresentationVisitor(aFormatter);
    this.info += formatKeyValue('Representation', aFormatter.str);
  }
  /**
   * @override
   * @param {cadex.ModelData_Instance} theInstance
   */
  async visitInstanceEnter(theInstance) {
    await this.visitElement(theInstance);
    this.info += formatKeyValue('Transformation', theInstance.transformation.toString().split(/\n/g).map(row => `<span>${row}</span><br>`).join(''));
    return false;
  }
  /**
   * @override
   * @param {cadex.ModelData_Instance} _theInstance
   */
  visitInstanceLeave(_theInstance) {
  }
  /**
   * @override
   * @param {cadex.ModelData_Assembly} theAssembly
   */
  async visitAssemblyEnter(theAssembly) {
    this.visitElement(theAssembly);
    return false;
  }
  /**
   * @override
   * @param {cadex.ModelData_Assembly} _theAssembly
   */
  async visitAssemblyLeave(_theAssembly) {
  }
}

function formatKeyValue(theKey, theValue) {
  // Wrap simple text with span element

  if (String(theValue).indexOf('<') === -1) {
    theValue = `<span>${theValue}</span>`;
  }
  return `<div class="info-row"><div class="info-name">${theKey}:</div><div class="info-value">${theValue}</div></div>`;
}

function formatEnumValue(theEnum, theValue) {
  return Object.keys(theEnum).find(v => theEnum[v] === theValue);
}

class TextureFormatter extends cadex.ModelData_TextureVisitor {
  /**
   * @param {string} theTextureBasePath
   */
  constructor(theTextureBasePath) {
    super();
    this.str = '';
    this.textureBasePath = theTextureBasePath;
  }
  /**
   * @param {cadex.ModelData_Texture} theTexture
   */
  formatTexture(theTexture) {
    this.str += formatKeyValue('Name', theTexture.name);
    this.str += formatKeyValue('Uuid', theTexture.uuid);
    this.str += formatKeyValue('Type', formatEnumValue(cadex.ModelData_TextureType, theTexture.type));
    let aParametersStr = null;
    if (theTexture.parameters) {
      aParametersStr = formatKeyValue('Generate mipmaps', theTexture.parameters.generateMipmaps);
      aParametersStr += formatKeyValue('Magnification Filter', formatEnumValue(cadex.ModelData_TextureMagnificationFilter, theTexture.parameters.magnificationFilter));
      aParametersStr += formatKeyValue('Minification Filter', formatEnumValue(cadex.ModelData_TextureMinificationFilter, theTexture.parameters.minificationFilter));
      aParametersStr += formatKeyValue('Wrap Mode', `(${formatEnumValue(cadex.ModelData_TextureWrapMode, theTexture.parameters.wrapModeU)}, ${formatEnumValue(cadex.ModelData_TextureWrapMode, theTexture.parameters.wrapModeV)})`);
      aParametersStr += formatKeyValue('Blend mode', formatEnumValue(cadex.ModelData_TextureBlendMode, theTexture.parameters.blendMode));
      aParametersStr += formatKeyValue('Mapping mode', formatEnumValue(cadex.ModelData_TextureMappingMode, theTexture.parameters.mappingMode));
      aParametersStr += formatKeyValue('Rotation', theTexture.parameters.rotation);
      aParametersStr += formatKeyValue('Scale', `(${theTexture.parameters.scaleU.toFixed(2)}, ${theTexture.parameters.scaleV.toFixed(2)})`);
      aParametersStr += formatKeyValue('Translation', `(${theTexture.parameters.translationU.toFixed(2)}, ${theTexture.parameters.translationV.toFixed(2)})`);
    }
    this.str += formatKeyValue('Parameters', aParametersStr);
  }
  /**
   * @param {cadex.ModelData_FileTexture} theFileTexture
   */
  async visitFileTexture(theFileTexture) {
    this.str += '<i>File Texture</i>';
    this.formatTexture(theFileTexture);
    // Considered the path is relative
    this.str += formatKeyValue('FilePath', `<img width="200" height="200" src="${this.textureBasePath}/${theFileTexture.filePath}">
                                            <br>${theFileTexture.filePath}`);
  }
  /**
   * @param {cadex.ModelData_PixMapTexture} thePixMapTexture
   */
  async visitPixMapTexture(thePixMapTexture) {
    this.str += '<i>PixMap Texture</i>';
    this.formatTexture(thePixMapTexture);
    let aPixMapStr = null;
    const aPixMap = await thePixMapTexture.pixmap();
    if (aPixMap) {
      aPixMapStr = formatKeyValue('PixelFormat', formatEnumValue(cadex.ModelData_PixelFormat, aPixMap.pixelFormat));
      aPixMapStr += formatKeyValue('Width', aPixMap.width);
      aPixMapStr += formatKeyValue('Height', aPixMap.height);
      aPixMapStr += formatKeyValue('Data', aPixMap.pixelData.byteLength + ' bytes');
    }
    this.str += formatKeyValue('PixMap', aPixMapStr);
  }
}

/**
 * @param {cadex.ModelData_Appearance|null} theAppearance
 * @returns {Promise<string|null>}
 */
async function formatAppearance(theAppearance, theTextureBasePath) {
  if (!theAppearance) {
    return null;
  }
  const formatColor = (theColor) => {
    return `<span class="colored-square" style="background:rgba${theColor}"></span><span>${theColor}</span>`;
  };
  let aString = formatKeyValue('Uuid', theAppearance.uuid);
  aString += formatKeyValue('Name', theAppearance.name);
  if (theAppearance.material) {
    let aMapString = formatKeyValue('Uuid', theAppearance.material.uuid);
    aMapString += formatKeyValue('Name', theAppearance.material.name);
    aMapString += formatKeyValue('Ambient', formatColor(theAppearance.material.ambientColor));
    aMapString += formatKeyValue('Diffuse', formatColor(theAppearance.material.diffuseColor));
    aMapString += formatKeyValue('Specular', formatColor(theAppearance.material.specularColor));
    aMapString += formatKeyValue('Emissive', formatColor(theAppearance.material.emissiveColor));
    aMapString += formatKeyValue('Shininess', theAppearance.material.shininess);
    aString += formatKeyValue('Material', aMapString);
  } if (theAppearance.genericColor) {
    let aColorString = formatKeyValue('Uuid', theAppearance.genericColor.uuid);
    aColorString += formatKeyValue('Name', theAppearance.genericColor.name);
    aColorString += formatKeyValue('Value', formatColor(theAppearance.genericColor));
    aString += formatKeyValue('Color', aColorString);
  }

  if (theAppearance.textureSet) {
    const aFormatter = new TextureFormatter(theTextureBasePath);
    let aTextureSetString = formatKeyValue('Uuid', theAppearance.textureSet.uuid);
    aTextureSetString += formatKeyValue('Name', theAppearance.textureSet.name);

    await theAppearance.textureSet.accept(aFormatter);
    aString += formatKeyValue('TextureSet', aTextureSetString + aFormatter.str);
  }
  return aString;
}
/**
 * @param {cadex.ModelData_PropertyTable|null} thePropertyTable
 * @returns {Promise<string|null>}
 */
async function formatPropertyTable(thePropertyTable) {
  if (!thePropertyTable) {
    return null;
  }
  const aProperties = await thePropertyTable.properties();
  let aString = '';
  Object.keys(aProperties).forEach(thePropName => {
    aString += formatKeyValue(thePropName, aProperties[thePropName]);
  });
  return aString;
}

// Use a visitor to iterate over representations
class RepresentationFormatter extends cadex.ModelData_RepresentationVisitor {
  /**
   * @param {string} theTextureBasePath
   */
  constructor(theTextureBasePath) {
    super();
    this.str = '';
    this.textureBasePath = theTextureBasePath;
    this.exploreSubShapes = false;
  }
  /**
   * @param {cadex.ModelData_BRepRepresentation} theBRepRep
   */
  async visitBRepRepresentation(theBRepRep) {
    this.str += '<i>BRep Representation</i>';
    this.str += formatKeyValue('Uuid', theBRepRep.uuid);
    this.str += formatKeyValue('Name', theBRepRep.name);
    let aBodiesStr = '';
    const aBodyList = await theBRepRep.bodyList();
    for (let i = 0; i < aBodyList.size(); i++) {
      const aBody = aBodyList.element(i);
      if (!aBody) {
        aBodiesStr += formatKeyValue(`Body ${i + 1}`, null);
        continue;
      }
      const aBodyTypeStr = formatEnumValue(cadex.ModelData_BodyType, aBody.bodyType);
      if (this.exploreSubShapes) {
        let aSubShapeStr = '';
        for (let aShape of aBody) {
          aSubShapeStr += this.visitShape(aShape);
        }
        aBodiesStr += formatKeyValue(`${aBodyTypeStr} body`, aSubShapeStr);
      } else {
        aBodiesStr += formatKeyValue(`Body ${i + 1}`, aBodyTypeStr);
      }
    }
    this.str += formatKeyValue('Bodies', aBodiesStr);
  }

  /**
   * @param {cadex.ModelData_Shape} theShape
   * @returns {string}
   */
  visitShape(theShape) {
    const aShapeType = Object.keys(cadex.ModelData_ShapeType).find(theKey => cadex.ModelData_ShapeType[theKey] === theShape.type);
    let aShapeStr = '';
    if (theShape.type === cadex.ModelData_ShapeType.Vertex) {
      aShapeStr += /** @type {cadex.ModelData_Vertex} */(theShape).point;
    } else {
      for (let aShape of theShape) {
        aShapeStr += this.visitShape(aShape);
      }
    }
    return formatKeyValue(aShapeType, aShapeStr);
  }

  /**
   * @param {cadex.ModelData_PolyRepresentation} thePolyRep
   */
  async visitPolyRepresentation(thePolyRep) {
    this.str += '<i>Poly Representation</i>';
    this.str += formatKeyValue('Uuid', thePolyRep.uuid);
    this.str += formatKeyValue('Name', thePolyRep.name);
    const aPolyShapeList = await thePolyRep.polyShapeList();
    for (let i = 0; i < aPolyShapeList.size(); i++) {
      const aPolyShape = aPolyShapeList.element(i);
      if (aPolyShape instanceof cadex.ModelData_IndexedTriangleSet) {
        let anITSStr = formatKeyValue('Uuid', aPolyShape.uuid);
        anITSStr += formatKeyValue('Name', aPolyShape.name);
        anITSStr += formatKeyValue('Triangles', aPolyShape.numberOfFaces);
        anITSStr += formatKeyValue('Vertices', `[${aPolyShape.numberOfVertices} items]`);
        anITSStr += formatKeyValue('Normals', aPolyShape.hasNormals() ? `[${aPolyShape.numberOfNormals} items]` : null);
        anITSStr += formatKeyValue('Colors', aPolyShape.hasColors() ? `[${aPolyShape.numberOfColors} items]` : null);
        anITSStr += formatKeyValue('UVCoordinates', aPolyShape.hasUVCoordinates() ? `[${aPolyShape.numberOfUVCoordinates} items]` : null);
        anITSStr += formatKeyValue('Appearance', await formatAppearance(aPolyShape.appearance, this.textureBasePath));
        this.str += formatKeyValue(`Triangle Set ${i + 1}`, anITSStr);
      } else if (aPolyShape instanceof cadex.ModelData_PolyLineSet) {
        let aPLSStr = formatKeyValue('Uuid', aPolyShape.uuid);
        aPLSStr += formatKeyValue('Name', aPolyShape.name);
        aPLSStr += formatKeyValue('Polylines', aPolyShape.numberOfPolylines);
        aPLSStr += formatKeyValue('Vertices', `[${aPolyShape.numberOfVertices} items]`);
        aPLSStr += formatKeyValue('Colors', aPolyShape.hasColors() ? `[${aPolyShape.numberOfColors} items]` : null);
        aPLSStr += formatKeyValue('Appearance', await formatAppearance(aPolyShape.appearance, this.textureBasePath));
        this.str += formatKeyValue(`Polyline Set ${i + 1}`, aPLSStr);
      } else if (aPolyShape instanceof cadex.ModelData_PolyPointSet) {
        let aPPSStr = formatKeyValue('Uuid', aPolyShape.uuid);
        aPPSStr += formatKeyValue('Name', aPolyShape.name);
        aPPSStr += formatKeyValue('Vertices', `[${aPolyShape.numberOfVertices} items]`);
        aPPSStr += formatKeyValue('Colors', aPolyShape.hasColors() ? `[${aPolyShape.numberOfColors} items]` : null);
        aPPSStr += formatKeyValue('Appearance', await formatAppearance(aPolyShape.appearance, this.textureBasePath));
        this.str += formatKeyValue(`Point Set ${i + 1}`, aPPSStr);
      }
    }
  }
}

// Use a visitor to iterate over PMI outlines
class PMIOutlineFormatter extends cadex.ModelData_PMIOutlineVisitor {
  constructor() {
    super();
    this.str = '';
  }
  /**
   * @param {cadex.ModelData_PMIPolyOutline} theOutline
   */
  visitPolyOutline(theOutline) {
    this.str += formatKeyValue('Type', 'PolyOutline');
    let aPolyLinesStr = '';
    if (!theOutline.lineSet) {
      this.str += formatKeyValue('LineSet', null);
      return;
    }
    for (let i = 0, n = theOutline.lineSet.numberOfPolylines; i < n; i++) {
      aPolyLinesStr += formatKeyValue('Line ' + (i + 1), theOutline.lineSet.numberOfLineVertices(i) + ' vertices');
    }
    this.str += formatKeyValue('LineSet', aPolyLinesStr);
  }
  /**
   * @override
   * @param {cadex.ModelData_PMIPoly2dOutline} _theOutline
   */
  visitPoly2dOutline(_theOutline) {
    this.str += formatKeyValue('Type', 'Poly2dOutline');
  }
  /**
   * @override
   * @param {cadex.ModelData_PMICurveOutline} _theOutline
   */
  visitCurveOutline(_theOutline) {
    this.str += formatKeyValue('Type', 'CurveOutline');
  }
  /**
   * @override
   * @param {cadex.ModelData_PMICurve2dOutline} _theOutline
   */
  visitCurve2dOutline(_theOutline) {
    this.str += formatKeyValue('Type', 'Curve2dOutline');
  }
  /**
   * @override
   * @param {cadex.ModelData_PMICompositeOutline} theOutline
   * @returns {boolean}
   */
  visitCompositeOutlineEnter(theOutline) {
    this.str += formatKeyValue('Type', 'CompositeOutline');
    let anOutlinesStr = '';
    for (const anOutline of theOutline.outlines()) {
      anOutlinesStr += formatPMIOutline(anOutline);
    }
    this.str += formatKeyValue('Outlines', anOutlinesStr);
    return true;
  }
  /**
   * @override
   * @param {cadex.ModelData_PMICompositeOutline} _theOutline
   */
  visitCompositeOutlineLeave(_theOutline) {
  }
}

// Use a visitor to iterate over PMI attributes.
class PMISemanticAttributeFormatter extends cadex.ModelData_PMISemanticAttributeVisitor {
  constructor() {
    super();
    this.str = '';
  }
  /**
   * @param {cadex.ModelData_PMIAngleUnitAttribute} theAttribute
   */
  visitAngleUnitAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'AngleUnit');
    this.str += formatKeyValue('Unit', `${theAttribute.unit}`);
  }
  /**
   * @param {cadex.ModelData_PMIDatumRefAttribute} theAttribute
   */
  visitDatumRefAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'DatumRef');
    this.str += formatKeyValue('Precedence', `${theAttribute.precedence}`);
    this.str += formatKeyValue('Target label', `${theAttribute.targetLabel}`);
  }
  /**
   * @param {cadex.ModelData_PMIDatumRefCompartmentAttribute} theAttribute
   */
  visitDatumRefCompartmentAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'DatumRefCompartment');
    this.str += formatKeyValue('References', `${theAttribute.references}`);
    this.str += formatKeyValue('Number of references', `${theAttribute.numberOfReferences}`);
    this.str += formatKeyValue('Modifier attributes', `${theAttribute.modifierAttributes}`);
    this.str += formatKeyValue('Number of modifier attributes', `${theAttribute.numberOfModifierAttributes}`);
  }
  /**
   * @param {cadex.ModelData_PMIDatumTargetAttribute} theAttribute
   */
  visitDatumTargetAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'DatumTarget');
    this.str += formatKeyValue('Index', `${theAttribute.index}`);
    this.str += formatKeyValue('Description', `${theAttribute.description}`);
  }
  /**
   * @param {cadex.ModelData_PMIDisplacementAttribute} theAttribute
   */
  visitDisplacementAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'Displacement');
    this.str += formatKeyValue('Displacement', `${theAttribute.displacement}`);
  }
  /**
   * @param {cadex.ModelData_PMILengthUnitAttribute} theAttribute
   */
  visitLengthUnitAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'LengthUnit');
    this.str += formatKeyValue('Unit', `${theAttribute.unit}`);
  }
  /**
   * @param {cadex.ModelData_PMILimitsAndFitsAttribute} theAttribute
   */
  visitLimitsAndFitsAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'LimitsAndFits');
    this.str += formatKeyValue('Limits and fits type', `${theAttribute.type}`);
    this.str += formatKeyValue('Value', `${theAttribute.value}`);
  }
  /**
   * @param {cadex.ModelData_PMIMaximumValueAttribute} theAttribute
   */
  visitMaximumValueAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'Maximum value');
    this.str += formatKeyValue('Max value', `${theAttribute.maxValue}`);
  }
  /**
   * @param {cadex.ModelData_PMIModifierAttribute} theAttribute
   */
  visitModifierAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'Modifier');
    this.str += formatKeyValue('Modifier', `${theAttribute.modifier}`);
  }
  /**
   * @param {cadex.ModelData_PMIModifierWithValueAttribute} theAttribute
   */
  visitModifierWithValueAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'Modifier with value');
    this.str += formatKeyValue('Modifier', `${theAttribute.modifier}`);
    this.str += formatKeyValue('Value', `${theAttribute.value}`);
  }
  /**
   * @param {cadex.ModelData_PMIPlusMinusBoundsAttribute} theAttribute
   */
  visitPlusMinusBoundsAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'PlusMinusBounds');
    this.str += formatKeyValue('UpperBound', `${theAttribute.upperBound}`);
    this.str += formatKeyValue('LowerBound', `${theAttribute.lowerBound}`);
  }
  /**
   * @param {cadex.ModelData_PMIQualifierAttribute} theAttribute
   */
  visitQualifierAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'Qualifier');
    this.str += formatKeyValue('Qualifier', `${theAttribute.qualifier}`);
  }
  /**
   * @param {cadex.ModelData_PMIRangeAttribute} theAttribute
   */
  visitRangeAttribute(theAttribute) {
    this.str += formatKeyValue('Type', 'Range');
    this.str += formatKeyValue('UpperLimit', `${theAttribute.upperLimit}`);
    this.str += formatKeyValue('LowerLimit', `${theAttribute.lowerLimit}`);
  }
}

/**
 * @param {cadex.ModelData_PMIOutline} theOutline
 */
function formatPMIOutline(theOutline) {
  if (!theOutline) {
    return null;
  }
  const aVisitor = new PMIOutlineFormatter();
  theOutline.accept(aVisitor);
  return aVisitor.str;
}

/**
 * @param {cadex.ModelData_PMISemanticAttribute} theAttribute
 * @returns {string | null}
 */
function formatPMISemanticAttribute(theAttribute) {
  if (!theAttribute) {
    return null;
  }
  const aVisitor = new PMISemanticAttributeFormatter();
  theAttribute.accept(aVisitor);
  return aVisitor.str;
}

// Use a visitor to iterate over Graphical PMI components
class PMIComponentFormatter extends cadex.ModelData_PMIGraphicalElementComponentVisitor {
  constructor() {
    super();
    this.str = '';
  }
  /**
   * @override
   * @param {cadex.ModelData_PMIOutlinedComponent} theComponent
   */
  visitOutlinedComponent(theComponent) {
    this.str += formatKeyValue('Type', 'Outlined');
    this.str += formatKeyValue('Outline', theComponent.outline ? formatPMIOutline(theComponent.outline) : null);
  }
  /**
   * @override
   * @param {cadex.ModelData_PMITextComponent} theComponent
   */
  visitTextComponent(theComponent) {
    this.str += formatKeyValue('Type', 'Text');
    this.str += formatKeyValue('Text', `"${theComponent.text}"`);
    this.str += formatKeyValue('Font Size', theComponent.fontSize);
    this.str += formatKeyValue('Text Origin', theComponent.textOrigin);
    this.str += formatKeyValue('Outline', theComponent.outline ? formatPMIOutline(theComponent.outline) : null);
  }
  /**
   * @override
   * @param {cadex.ModelData_PMITriangulatedComponent} theComponent
   */
  visitTriangulatedComponent(theComponent) {
    this.str += formatKeyValue('Type', 'Triangulated');
    this.str += formatKeyValue('Triangle Set', theComponent.triangleSet ? `{${theComponent.triangleSet.numberOfFaces} triangles}` : null);
  }
}

// Use a visitor to iterate over Semantic PMI components
class PMISemanticComponentFormatter extends cadex.ModelData_PMISemanticElementComponentVisitor {
  constructor() {
    super();
    this.str = '';
  }
  /**
   * @param {cadex.ModelData_PMIDatumComponent} theComponent
   */
  visitDatumComponent(theComponent) {
    this.str += formatKeyValue('Type', 'Datum');
    this.str += formatKeyValue('Label', `${theComponent.label}`);
    if (theComponent.attributes.length > 0) {
      let attributes = '';
      for (let i = 0; i < theComponent.attributes.length; ++i) {
        attributes += `<i>Attribute ${i + 1}</i>` + formatPMISemanticAttribute(theComponent.attributes[i]);
      }
      this.str += formatKeyValue('Attributes', attributes);
    }
  }
  /**
   * @param {cadex.ModelData_PMIDimensionComponent} theComponent
   */
  visitDimensionComponent(theComponent) {
    this.str += formatKeyValue('Type', 'Dimension');
    this.str += formatKeyValue('Nominal value', `${theComponent.nominalValue}`);
    const aTypeOfDimension = Object.entries(cadex.ModelData_PMIDimensionType).find((entry) => entry[1] === theComponent.typeOfDimension)?.[0] ?? 'Undefined';
    this.str += formatKeyValue('Type of dimension', `${aTypeOfDimension}`);
    if (theComponent.attributes.length > 0) {
      let attributes = '';
      for (let i = 0; i < theComponent.attributes.length; ++i) {
        attributes += `<i>Attribute ${i + 1}</i>` + formatPMISemanticAttribute(theComponent.attributes[i]);
      }
      this.str += formatKeyValue('Attributes', attributes);
    }
  }
  /**
   * @param {cadex.ModelData_PMIGeometricToleranceComponent} theComponent
   */
  visitGeometricToleranceComponent(theComponent) {
    this.str += formatKeyValue('Type', 'Geometric tolerance');
    this.str += formatKeyValue('Magnitude', `${theComponent.magnitude}`);
    const aTypeOfToleranceZoneForm = Object.entries(cadex.ModelData_PMIGeometricToleranceZoneFormType).find((entry) => entry[1] === theComponent.toleranceZoneForm)?.[0] ?? 'Undefined';
    this.str += formatKeyValue('Tolerance zone form type', `${aTypeOfToleranceZoneForm}`);
    if (theComponent.attributes.length > 0) {
      let attributes = '';
      for (let i = 0; i < theComponent.attributes.length; ++i) {
        attributes += `<i>Attribute ${i + 1}</i>` + formatPMISemanticAttribute(theComponent.attributes[i]);
      }
      this.str += formatKeyValue('Attributes', attributes);
    }
  }
}

/**
 * @param {cadex.ModelData_PMIGraphicalElementComponent} theComponent
 * @returns {string}
 */
function formatPMIComponent(theComponent) {
  const aVisitor = new PMIComponentFormatter();
  theComponent.accept(aVisitor);
  return aVisitor.str;
}

/**
 * @param {cadex.ModelData_PMISemanticElementComponent} theComponent
 * @returns {string}
 */
function formatPMISemanticComponent(theComponent) {
  const aVisitor = new PMISemanticComponentFormatter();
  theComponent.accept(aVisitor);
  return aVisitor.str;
}

/**
 * @param {cadex.ModelData_PMIGraphicalElement} theElement
 * @param {ReadonlyArray<cadex.ModelData_PMIPlane>} thePlanes
 * @returns {string|null}
 */
function formatPMIGraphicalElement(theElement, thePlanes) {
  if (!theElement) {
    return null;
  }
  let aPMIGraphicalElementStr = formatKeyValue('Name', theElement.name);
  let aComponentsStr = '';
  for (let j = 0, k = theElement.components.length; j < k; ++j) {
    aComponentsStr += `<i>Component ${j + 1}</i>` + formatPMIComponent(theElement.components[j]);
  }
  aPMIGraphicalElementStr += formatKeyValue('Components', aComponentsStr);
  aPMIGraphicalElementStr += formatKeyValue('Plane', theElement.plane ? (`ref {Plane ${thePlanes.indexOf(theElement.plane) + 1}}`) : null);

  return aPMIGraphicalElementStr;
}

/**
 * @param {cadex.ModelData_PMISemanticElement} theElement
 * @returns {string}
 */
function formatPMISemanticElement(theElement) {
  if (!theElement) {
    return '';
  }
  let aPMISemanticElementStr = formatKeyValue('Name', theElement.name);
  let aComponentsStr = '';
  for (let j = 0, k = theElement.components.length; j < k; ++j) {
    aComponentsStr += `<i>Component ${j + 1}</i>` + formatPMISemanticComponent(theElement.components[j]);
  }
  aPMISemanticElementStr += formatKeyValue('Components', aComponentsStr);

  return aPMISemanticElementStr;
}

/**
 * @param {cadex.ModelData_PMICamera|null} theCamera
 * @returns {string}
 */
function formatPMICamera(theCamera) {
  if (!theCamera) {
    return formatKeyValue('Camera', null);
  }
  let aCameraStr = '';
  aCameraStr += formatKeyValue('Name', theCamera.name);
  aCameraStr += formatKeyValue('location', theCamera.location);
  aCameraStr += formatKeyValue('targetPoint', theCamera.targetPoint);
  aCameraStr += formatKeyValue('upDirection', theCamera.upDirection);
  return formatKeyValue('Camera', aCameraStr);
}

/**
* @param {cadex.ModelData_PMITable|null} thePMITable
* @returns {Promise<string|null>}
*/
async function formatPMITable(thePMITable) {
  if (!thePMITable) {
    return null;
  }
  let aString = formatKeyValue('Name', thePMITable.name);
  aString += formatKeyValue('Uuid', thePMITable.uuid);
  const aDataItems = await thePMITable.pmiDataItems();
  const aViews = await thePMITable.views();
  const aPlanes = await thePMITable.planes();

  let aDataItemStr = aDataItems.length > 0 ? '' : '[ ]';
  for (let i = 0, n = aDataItems.length; i < n; i++) {
    const aDataItem = aDataItems[i];
    aDataItemStr += `<i>PMI Data Item ${i + 1}</i>`;
    aDataItemStr += formatKeyValue('Uuid', aDataItem.uuid);
    aDataItemStr += formatKeyValue('Name', aDataItem.name);
    aDataItemStr += formatKeyValue('Type', Object.keys(cadex.ModelData_PMIType).find(key => `${cadex.ModelData_PMIType[key]}` === `${aDataItem.type}`));
    const aPropsText = await formatPropertyTable(aDataItem.properties);
    aDataItemStr += formatKeyValue('Properties', aPropsText);
    const aGraphicalElement = aDataItem.graphicalElement;
    if (aGraphicalElement) {
      const aGraphicalElementText = formatPMIGraphicalElement(aGraphicalElement, aPlanes);
      aDataItemStr += formatKeyValue('Graphical Element', aGraphicalElementText);
    } else {
      aDataItemStr += formatKeyValue('Graphical Element', null);
    }
    const aSemanticElement = aDataItem.semanticElement;
    if (aSemanticElement) {
      const aSemanticElementText = formatPMISemanticElement(aSemanticElement);
      aDataItemStr += formatKeyValue('Semantic Element', aSemanticElementText);
    } else {
      aDataItemStr += formatKeyValue('Semantic Element', null);
    }
  }
  aString += formatKeyValue('PMI Data', aDataItemStr);

  let aViewsStr = aViews.length > 0 ? '' : '[ ]';
  for (let i = 0, n = aViews.length; i < n; i++) {
    const aSavedView = aViews[i];
    aViewsStr += `<i>Saved View ${i + 1}</i>`;
    aViewsStr += formatKeyValue('Uuid', aSavedView.uuid);
    aViewsStr += formatKeyValue('Name', aSavedView.name);
    aViewsStr += formatPMICamera(aSavedView.camera);
    let anElements = '';
    for (const theElement of aSavedView.graphicalElements()) {
      anElements += `{Graphical Element of PMI Data Item ${aDataItems.findIndex((theData) => theData.graphicalElement === theElement) + 1}}`;
    }
    aViewsStr += formatKeyValue('Elements', anElements);
  }
  aString += formatKeyValue('Saved Views', aViewsStr);

  let aPlanesStr = aPlanes.length > 0 ? '' : '[ ]';
  for (let i = 0, n = aPlanes.length; i < n; i++) {
    aPlanesStr += `<i>Plane ${i + 1}</i>`;
    const aPMIPlane = aPlanes[i];
    aPlanesStr += formatKeyValue('Name', aPMIPlane.name);
    aPlanesStr += formatKeyValue('Uuid', aPMIPlane.uuid);
    aPlanesStr += formatKeyValue('Location', aPMIPlane.plane ? aPMIPlane.plane.location : null);
    aPlanesStr += formatKeyValue('Direction', aPMIPlane.plane ? aPMIPlane.plane.direction : null);
  }
  aString += formatKeyValue('Planes', aPlanesStr);

  return aString;
}

class ModelExplorerExample {
  constructor() {
    // The model
    this.model = new cadex.ModelData_Model();
    // The scene for visualization
    this.scene = new cadex.ModelPrs_Scene();

    // The viewport for visualization. Initializing with default config and element attach to.
    this.viewport = new cadex.ModelPrs_ViewPort({}, /** @type {HTMLElement} */(document.getElementById('file-viewer')));
    // Attach viewport to scene to render content of
    this.viewport.attachToScene(this.scene);

    const aJSTreeConfig = {
      core: {
        multiple: false,
        check_callback: true,
        themes: {
          'name': null, //'default',
          'dots': true,
        }
      },
      'types': {
        'file': {
          'icon': 'icon-file'
        },
        'assembly': {
          'icon': 'icon-assembly'
        },
        'instance': {
          'icon': 'icon-instance'
        },
        'part': {
          'icon': 'icon-part'
        }
      },
      'plugins': ['wholerow', 'types']
    };

    // Initialize jsTree library used for visualizing scenegraph structure (see https://www.jstree.com/)
    $('#tree-container').jstree(aJSTreeConfig)
      .on('select_node.jstree', async (_theEvent, theData) => {
        if (theData.node.data && theData.node.data.sge) {
          const aVisitor = new SceneGraphElementFormatter(theData.node.data.textureBasePath);
          await theData.node.data.sge.accept(aVisitor);
          $('#info-card').html(aVisitor.info);
        } else {
          const anInfoCardMessage = document.createElement('span');
          anInfoCardMessage.textContent = 'No information available.';
          $('#info-card').html(anInfoCardMessage);
        }
      });

    this.sceneGraphTree = $('#tree-container').jstree(true);

    this.currentModelNode = null;
  }

  /**
   * @param {string} theModelPath
   * @param {string} theModelName
   */
  async loadAndTraverseModel(theModelPath, theModelName) {
    try {
      // Clean up scene to display new model
      this.scene.clear();
      await this.scene.update();

      const anInfoCardMessage = document.createElement('span');
      anInfoCardMessage.textContent = 'Select tree node to see element info.';
      $('#info-card').html(anInfoCardMessage);

      if (this.currentModelNode) {
        this.sceneGraphTree.delete_node(this.currentModelNode);
      }

      // Model uses multiple external files, so requires provider to fetch it.
      /** @type {cadex.ModelData_CDXFBBufferProvider} */
      const dataLoader = (theModelPath, theObjId, theProgressScope) => {
        return fetchFile(modelUrl(theModelPath) + '/' + theObjId, theProgressScope);
      };

      // Load model by URL.
      const aLoadResult = await this.model.loadFile(theModelPath, dataLoader, false /*append roots*/);
      console.log(`${theModelPath} is loaded\n`, aLoadResult);

      // Create root file item
      // eslint-disable-next-line require-atomic-updates
      this.currentModelNode = this.sceneGraphTree.create_node(null, {
        text: theModelName,
        type: 'file',
        data: {}
      });

      // Feed tree with model structure
      const aVisitor = new SceneGraphToTreeConverter(this.sceneGraphTree, this.currentModelNode, modelUrl(theModelPath));
      await this.model.accept(aVisitor);
      this.sceneGraphTree.open_all(null, 0);

      // Create visualization graph for model.
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

const aModelExplorerExample = new ModelExplorerExample();

initModelSelector('as1-oc-214.stp', aModelExplorerExample.loadAndTraverseModel.bind(aModelExplorerExample));
