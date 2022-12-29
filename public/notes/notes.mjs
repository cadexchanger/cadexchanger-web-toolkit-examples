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
 * @typedef CameraState
 * @property {cadex.ModelData_Point} position
 * @property {cadex.ModelData_Point} target
 * @property {cadex.ModelData_Direction} up
 */

/**
 * Represents editable note with 'actives' state.
 */
class Note extends cadex.ModelPrs_Annotation {
  /**
   * @param {cadex.ModelData_Point} thePoint
   * @param {cadex.ModelPrs_SceneNode} theSceneNode
   * @param {CameraState} theCameraState
   */
  constructor(thePoint, theSceneNode, theCameraState) {

    const aPinElement = document.createElement('div');
    const aCardElement = document.createElement('div');

    super({
      position: thePoint,
      sceneNode: theSceneNode,
      markerElement: aPinElement,
      labelElement: aCardElement,
      markerShown: true,
      labelShown: false,
    });

    aPinElement.classList.add('note-pin');
    aCardElement.classList.add('note-card');

    aPinElement.addEventListener('click', () => {
      this.dispatchEvent({ type: 'pinClicked' });
    });

    this.cameraState = theCameraState;

    /** @type {string} */
    this.label = '';
    /**
     * @private
     * @type {boolean}
     */
    this._isEdit = true;

    this._updateCard();
  }

  get isEdit() {
    return this._isEdit;
  }

  set isEdit(theEdit) {
    if (theEdit !== this._isEdit) {
      this._isEdit = theEdit;
      this._updateCard();
      this.dispatchEvent({ 'type': 'isEditChanged' });
    }
  }

  get isActive() {
    return this.isLabelShown;
  }

  set isActive(theActive) {
    if (theActive !== this.isLabelShown) {
      this.isLabelShown = theActive;
      this.markerElement.classList.toggle('active', theActive);
      this.dispatchEvent({ type: 'isActiveChanged' });
    }
  }

  /**
   * @private
   */
  _updateCard() {
    const aLabelElement = /** @type {HTMLElement} */(this.labelElement);
    aLabelElement.classList.toggle('editing', this._isEdit);
    if (this._isEdit) {
      aLabelElement.textContent = '';

      const aCardInner = document.createElement('div');
      aCardInner.classList.add('note-card__inner');
      aLabelElement.appendChild(aCardInner);

      const anInput = document.createElement('input');
      anInput.type = 'text';
      anInput.placeholder = 'Write text...';
      anInput.value = this.label;
      aCardInner.appendChild(anInput);

      const saveEdit = () => {
        this.label = anInput.value;
        this.isEdit = false;
      };
      const cancelEdit = () => {
        this.isEdit = false;
      };

      const aSaveButton = document.createElement('img');
      aSaveButton.src = '/assets/images/done.svg';
      aSaveButton.addEventListener('click', saveEdit);
      aCardInner.appendChild(aSaveButton);

      const aCancelButton = document.createElement('img');
      aCancelButton.src = '/assets/images/delete.svg';
      aCancelButton.addEventListener('click', cancelEdit);
      aCardInner.appendChild(aCancelButton);

      // Some keyboard user friendliness: save on 'enter' press, cancel on 'escape' press
      anInput.addEventListener('keyup', (theEvent) => {
        if (theEvent.key === 'Enter') {
          saveEdit();
        } else if (theEvent.key === 'Escape') {
          cancelEdit();
        }
      });

      // focus input when it will be shown
      setTimeout(() => {
        anInput.focus();
      }, 100);
    } else {
      aLabelElement.innerHTML = `<div class="note-label"><span>${this.label}</span></div>`;
    }
  }
}

/**
 * Represents collection of notes with one active note.
 */
class NotesManager extends cadex.ModelPrs_MarkersManager {
  constructor() {
    super();
    this.listOfNotesDom = /** @type {HTMLElement} */(document.getElementById('notes-container'));
    /** @type {Note|null} */
    this.temporaryNode = null;
    /** @type {Note|null} */
    this.activeNote = null;

    this.onNotePinClicked = this.onNotePinClicked.bind(this);
    this.onNoteCardOutsideClicked = this.onNoteCardOutsideClicked.bind(this);
  }

  /**
   * @param {cadex.ModelData_Point} thePoint
   * @param {cadex.ModelPrs_SceneNode} theSceneNode
   */
  addTemporaryNote(thePoint, theSceneNode) {
    if (!this.viewport) {
      return;
    }

    this.activateNote(null);

    const aCamera = this.viewport.camera;
    const aTemporaryNode = new Note(thePoint, theSceneNode, {
      position: aCamera.position.clone(),
      target: aCamera.target.clone(),
      up: aCamera.up.clone(),
    });

    this.addMarker(aTemporaryNode);
    this.activateNote(aTemporaryNode);

    const onTemporaryNoteChanged = () => {
      this.temporaryNode = null;

      aTemporaryNode.removeEventListener('isEditChanged', onTemporaryNoteChanged);
      aTemporaryNode.removeEventListener('isActiveChanged', onTemporaryNoteChanged);

      if (aTemporaryNode.label) {
        this.addNote(aTemporaryNode);
        this.activateNote(aTemporaryNode);
      } else {
        aTemporaryNode.isActive = false;
        this.removeMarker(aTemporaryNode);
      }
    };

    aTemporaryNode.addEventListener('isEditChanged', onTemporaryNoteChanged);
    aTemporaryNode.addEventListener('isActiveChanged', onTemporaryNoteChanged);

    this.temporaryNode = aTemporaryNode;
  }

  /**
   * @param {Note|null} theNote
   */
  async activateNote(theNote) {
    if (this.activeNote === theNote) {
      return;
    }
    if (this.activeNote) {
      this.activeNote.isActive = false;
      this.activeNote = null;
    }
    if (!theNote) {
      document.removeEventListener('pointerdown', this.onNoteCardOutsideClicked);
      return;
    }
    if (theNote.cameraState && this.viewport) {
      this.viewport.camera.set(theNote.cameraState.position, theNote.cameraState.target, theNote.cameraState.up);
    }
    theNote.isActive = true;
    this.activeNote = theNote;
    document.addEventListener('pointerdown', this.onNoteCardOutsideClicked);
  }

  /**
   * @param {Note} theNote
   */
  addNote(theNote) {
    if (!this.containsMarker(theNote)) {
      this.addMarker(theNote);
    }

    theNote.addEventListener('pinClicked', this.onNotePinClicked);

    this.updateNotesList();
  }

  /**
   * @param {Note} theNote
   */
  removeNote(theNote) {
    if (!this.containsMarker(theNote)) {
      return;
    }
    this.removeMarker(theNote);

    theNote.removeEventListener('pinClicked', this.onNotePinClicked);

    this.updateNotesList();
  }

  removeAllMarkers() {
    for (let aMarker of this.markers()) {
      this.removeNote(/** @type {Note}*/(aMarker));
    }
  }

  /**
   * @param {cadex.ModelPrs_Event<"pinClicked", Note>} theEvent
   */
  onNotePinClicked(theEvent) {
    this.activateNote(theEvent.target);
  }

  /**
   * @param {PointerEvent} theEvent
   */
  onNoteCardOutsideClicked(theEvent) {
    if (this.activeNote && /** @type {HTMLElement|null} */(theEvent?.target)?.closest('.note-card') !== this.activeNote.labelElement) {
      this.activateNote(null);
    }
  }

  /**
   * Updates list with notes
   */
  updateNotesList() {
    // Just for demo purpose: clean up all content and re-generate note-cards
    this.listOfNotesDom.innerHTML = '';

    for (const aMarker of this.markers()) {
      const aNote = /** @type {Note} */(aMarker);
      const aNoteListElement = document.createElement('div');
      aNoteListElement.classList.add('note-card');
      aNoteListElement.style.display = 'flex';

      const aLabelElement = document.createElement('div');
      aLabelElement.innerHTML = aNote.label;
      aLabelElement.classList.add('note-label');
      aNoteListElement.appendChild(aLabelElement);

      const aDeleteButton = document.createElement('img');
      aDeleteButton.src = '/assets/images/delete.svg';
      aDeleteButton.addEventListener('click', (theEvent) => {
        theEvent.stopPropagation();
        this.removeNote(aNote);
      });
      aNoteListElement.appendChild(aDeleteButton);

      aNoteListElement.addEventListener('click', () => {
        this.activateNote(aNote);
      });

      this.listOfNotesDom.appendChild(aNoteListElement);
    }
  }
}

class ContextMenuHandler extends cadex.ModelPrs_ContextMenuHandler {
  /**
   * @param {cadex.ModelPrs_Scene} theScene
   * @param {NotesManager} theNotesManager
   */
  constructor(theScene, theNotesManager) {
    super();
    this.scene = theScene;
    this.notesManager = theNotesManager;

    this.contextMenuElement = /** @type {HTMLElement}*/(document.getElementById('context-menu'));

    this.addNoteButton = document.createElement('div');
    this.addNoteButton.id = 'add-note-button';
    this.addNoteButton.textContent = 'Add note';
    this.contextMenuElement.appendChild(this.addNoteButton);

    /** @type {{node: cadex.ModelPrs_SceneNode, point: cadex.ModelData_Point} | null} */
    this.lastContextMenuState = null;

    this.addNoteButton.addEventListener('click', () => {
      this.hideContextMenu();

      if (!this.lastContextMenuState) {
        this.notesManager.activateNote(null);
        return;
      }

      // Create temporary note and display it in viewer
      this.notesManager.addTemporaryNote(this.lastContextMenuState.point, this.lastContextMenuState.node);
    });

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
    if (aPickResult && aPickResult.node) {
      this.lastContextMenuState = {
        point: aPickResult.point,
        node: aPickResult.node,
      };
      this.addNoteButton.classList.remove('disabled');
    } else {
      this.lastContextMenuState = null;
      this.addNoteButton.classList.add('disabled');
    }
    this.contextMenuElement.style.display = 'block';
    this.contextMenuElement.style.left = `${aPosition.x}px`;
    this.contextMenuElement.style.top = `${aPosition.y}px`;
  }

  hideContextMenu() {
    this.contextMenuElement.style.display = '';
  }
}

class NotesExample {
  constructor() {
    // The model
    this.model = new cadex.ModelData_Model();
    // The scene for visualization
    this.scene = new cadex.ModelPrs_Scene();

    // The viewport for visualization. Initializing with default config and element attach to.
    this.viewport = new cadex.ModelPrs_ViewPort({}, /** @type {HTMLElement} */(document.getElementById('file-viewer')));
    // Attach viewport to scene to render content of
    this.viewport.attachToScene(this.scene);

    // Use custom marker manager with binding to UI elements
    this.notesManager = new NotesManager();
    this.viewport.markerManager = this.notesManager;

    // Enables context menu handling
    const aContextMenuHandler = new ContextMenuHandler(this.scene, this.notesManager);
    this.viewport.inputManager.pushInputHandler(aContextMenuHandler);
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
}

const aNotesExample = new NotesExample();

initModelSelector('round flush pin gage.prt', aNotesExample.loadAndDisplayModel.bind(aNotesExample));
