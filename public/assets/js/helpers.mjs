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
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS 'AS IS'
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

import cadex from '@cadexchanger/web-toolkit';

/**
 * @param {string} theModelId
 * @returns {string}
 */
export function modelUrl(theModelId) {
  return '/assets/models/' + theModelId;
}

class CancellationObserver extends cadex.Base_ProgressStatusObserver {
  /**
   * @param {XMLHttpRequest} xhr
   */
  constructor(xhr) {
    super();
    this.xhr = xhr;
  }

  /**
   * @override
   */
  changedValue() { }

  /**
   * @override
   */
  completed() { }

  /**
   * @override
   */
  canceled() {
    this.xhr.abort();
  }
}

/**
 * Remote file data provider.
 * @param {string} theUrl
 * @param {cadex.Base_ProgressScope} theProgressScope
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchFile(theUrl, theProgressScope) {
  const aFileDownloadingScope = new cadex.Base_ProgressScope(theProgressScope);
  /** @type {CancellationObserver|undefined} */
  let aProgressStatusCancelationObserver;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'arraybuffer';
    xhr.open('GET', theUrl, true);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject(new Error(xhr.statusText));
      }
    };
    xhr.onerror = () => {
      reject(new Error(xhr.statusText));
    };
    xhr.onprogress = (event) => {
      aFileDownloadingScope.increment(event.loaded - aFileDownloadingScope.value);
    };
    xhr.onreadystatechange = () => {
      if (xhr.readyState === xhr.HEADERS_RECEIVED && xhr.status === 200) {
        const fileSize = xhr.getResponseHeader('content-length');
        aFileDownloadingScope.setRange(0, Number(fileSize));
      }
    };

    aProgressStatusCancelationObserver = new CancellationObserver(xhr);
    aFileDownloadingScope.owner.register(aProgressStatusCancelationObserver);

    xhr.send();
  })
    .finally(() => {
      aFileDownloadingScope.close();
      if (aProgressStatusCancelationObserver) {
        aFileDownloadingScope.owner.unregister(aProgressStatusCancelationObserver);
      }
    });
}

/**
 * Fetches list of models.
 * @returns {Promise<Array<{name:string, path:string, hasPMI?: boolean}>>}
 */
export async function getModelList() {
  const aRes = await fetch(modelUrl('models.json'));
  return await aRes.json();
}

/**
 * Initializes model selector.
 * @param {string} theDefaultModelName
 * @param {function(string, string):*} onModelChanged
 * @param {function({name: string, path: string, hasPMI?: boolean}):boolean} [filter]
 */
export async function initModelSelector(theDefaultModelName, onModelChanged, filter) {
  let aModelsInfo = await getModelList();

  if (filter) {
    aModelsInfo = aModelsInfo.filter(filter);
  }

  const aQueryModelName = new URLSearchParams(window.location.search).get('model');
  if (aQueryModelName) {
    const aSelectedModelIndex = aModelsInfo.findIndex((theModel) => theModel.name === aQueryModelName);
    if (aSelectedModelIndex === -1) {
      // redirect to example with default settings
      window.location.href = window.location.origin + window.location.pathname;
    } else {
      const anInfo = aModelsInfo[aSelectedModelIndex];
      onModelChanged(anInfo.path, anInfo.name);
    }
    return;
  }

  let aModelSelectorSelect = /** @type {HTMLSelectElement} */(document.querySelector('#model-selector > select'));
  if (!aModelSelectorSelect) {
    let aModelSelectorContainer = document.getElementById('model-selector');
    if (!aModelSelectorContainer) {
      let anExampleContainer = document.getElementById('example-container');
      if (!anExampleContainer) {
        return;
      }

      aModelSelectorContainer = document.createElement('div');
      aModelSelectorContainer.id = 'model-selector';
      anExampleContainer.appendChild(aModelSelectorContainer);
    }

    const aModelSelectorTitle = document.createElement('div');
    aModelSelectorTitle.innerText = 'Select model:';
    aModelSelectorContainer.appendChild(aModelSelectorTitle);

    aModelSelectorSelect = document.createElement('select');
    aModelSelectorContainer.appendChild(aModelSelectorSelect);
  }

  aModelsInfo.forEach(theModel => {
    const anOption = document.createElement('option');
    anOption.text = theModel.name;
    aModelSelectorSelect.add(anOption);
  });

  /* Possible fix for extra-width of options panel: */
  /* const options = document.querySelectorAll('option');
  options.forEach(option => {
    if(option.textContent.length > 30) {
      option.textContent = option.textContent.substring(0, 30) + '...';
    }
  }); */

  let aSelectedModelIndex = aModelsInfo.findIndex((theModel) => theModel.name === theDefaultModelName);
  if (aSelectedModelIndex === -1) {
    aSelectedModelIndex = 0;
  }
  aModelSelectorSelect.selectedIndex = aSelectedModelIndex;

  const onchange = () => {
    const anInfo = aModelsInfo[aModelSelectorSelect.selectedIndex];
    if (anInfo) {
      onModelChanged(anInfo.path, anInfo.name);
    }
  };
  aModelSelectorSelect.onchange = onchange;
  onchange();
}

/**
 * Moves the camera periodically to position when the whole model is in sight (for better user UX)
 * @param {cadex.ModelPrs_Scene} theScene
 * @param {cadex.ModelPrs_ViewPort} theViewPort
 * @param {cadex.Base_ProgressScope} [theProgressScope]
 */
export async function updateSceneSmoothly(theScene, theViewPort, theProgressScope) {
  // Fit all camera ~3 times per second
  let aLastBBoxChangedTime = 0;
  const onSceneBBoxChanged = () => {
    const aCurrentTime = new Date().getTime();
    if (aCurrentTime - aLastBBoxChangedTime > 300) {
      aLastBBoxChangedTime = aCurrentTime;
      theViewPort.fitAll();
    }
  };
  theScene.addEventListener('boundingBoxChanged', onSceneBBoxChanged);

  // Update scene to apply changes.
  await theScene.update(theProgressScope);

  theScene.removeEventListener('boundingBoxChanged', onSceneBBoxChanged);
}

export class ProgressStatusManager extends cadex.Base_ProgressStatusObserver {
  constructor() {
    super();
    let anExampleContainer = document.getElementById('example-container');
    if (!anExampleContainer) {
      return;
    }

    this.myProgressIndicator = document.createElement('div');
    this.myProgressIndicator.id = 'progress';
    this.myProgressIndicator.classList.add('progress');
    anExampleContainer.appendChild(this.myProgressIndicator);

    this.myProgressBar = document.createElement('div');
    this.myProgressBar.classList.add('progress-bar');
    this.myProgressBar.setAttribute('role', 'progressbar');
    this.myProgressBar.setAttribute('aria-valuenow', '0');
    this.myProgressBar.style.width = '0%';
    this.myProgressBar.textContent = '0%';
    this.myProgressIndicator.appendChild(this.myProgressBar);
  }

  /**
   * @returns {cadex.Base_ProgressStatus}
   */
  init() {
    if (!this.myProgressIndicator) {
      return new cadex.Base_ProgressStatus();
    }
    if (this.myProgressStatus) {
      this.myProgressStatus.cancel();
      this.myProgressStatus.unregister(this);
    }
    this.myProgressStatus = new cadex.Base_ProgressStatus();
    this.myProgressStatus.register(this);
    this.myProgressIndicator.style.visibility = 'visible';
    return this.myProgressStatus;
  }

  /**
   * @override
   * @param {!cadex.Base_ProgressStatus} theStatus
   */
  changedValue(theStatus) {
    const aValue = `${Math.floor(theStatus.value)}%`;
    const aProgressBar = /** @type {!HTMLDivElement} */(this.myProgressBar);
    aProgressBar.style.width = aValue;
    aProgressBar.textContent = aValue;
    aProgressBar.setAttribute('aria-valuenow', `${Math.round(theStatus.value)}`);
  }

  /**
   * @override
   * @param {!cadex.Base_ProgressStatus} theStatus
   */
  completed(theStatus) {
    const aValue = `${Math.floor(theStatus.value)}%`;
    const aProgressBar = /** @type {!HTMLDivElement} */(this.myProgressBar);
    aProgressBar.style.width = aValue;
    aProgressBar.textContent = aValue;
    aProgressBar.setAttribute('aria-valuenow', `${Math.round(theStatus.value)}`);
    // hide progress status with delay
    setTimeout(() => {
      /** @type {!HTMLDivElement} */(this.myProgressIndicator).style.visibility = 'hidden';
      aProgressBar.style.width = '0%';
    }, 1000);
  }

  /**
   * @override
   */
  canceled() {
    // hide progress status with delay
    setTimeout(() => {
      /** @type {!HTMLDivElement} */(this.myProgressIndicator).style.visibility = 'hidden';
      /** @type {!HTMLDivElement} */(this.myProgressBar).style.width = '0%';
    }, 1000);
  }
}
