
  function modelUrl(theModelPath) {
    return '/assets/models/' + theModelPath;
  }

  // CAD Exchanger Web Toolkit use providers for remote file. Returned value should be Promise<ArrayBuffer>.
  async function fetchFile(theUrl) {
    const aRes = await fetch(theUrl);
    if (aRes.status === 200) {
      return aRes.arrayBuffer();
    }
    throw new Error(aRes.statusText);
  }

  /**
   * @returns {Array<{name:string,path:string}>}
   */
  async function getModelList() {
    const theRes = await fetch(modelUrl('models.json'));
    return await theRes.json();
  }

  async function initModelSelector(theDefaultModelName, onModelChanged, filter) {
    const aQueryModelName = new URLSearchParams(window.location.search).get('model');

    let aModelsInfo = await getModelList();
    /** @type {HTMLSelectElement} */
    const aModelSelectorSelect = document.querySelector('#model-selector>select');

    if (filter) {
      aModelsInfo = aModelsInfo.filter(filter);
    }

    let aSelectedModelIndex = aModelsInfo.findIndex((theModel) => theModel.name === aQueryModelName);
    const isQueryModelNameFound = aSelectedModelIndex !== -1;
    if (aSelectedModelIndex === -1) {
      aSelectedModelIndex = aModelsInfo.findIndex((theModel) => theModel.name === theDefaultModelName);
    }

    if (aQueryModelName) {
      if (!isQueryModelNameFound) {
        window.location.href = window.location.origin + window.location.pathname;
        return;
      }
      const anInfo = aModelsInfo[aSelectedModelIndex];
      onModelChanged(anInfo.path, anInfo.name);
      return;
    }

    /** @type {HTMLSelectElement} */
    const aModelSelector = document.getElementById('model-selector');
    if (aModelSelector) {
      aModelSelector.classList.add('show');
    }
    if (aModelSelectorSelect) {
      aModelsInfo.forEach(theModel => {
        const anOption = document.createElement('option');
        anOption.text = theModel.name;
        aModelSelectorSelect.add(anOption);
      });

      if (aSelectedModelIndex !== -1) {
        aModelSelectorSelect.selectedIndex = aSelectedModelIndex;
      }

      aModelSelectorSelect.onchange = () => {
        const anInfo = aModelsInfo[aModelSelectorSelect.selectedIndex];
        if (anInfo) {
          onModelChanged(anInfo.path, anInfo.name);
        }
      };
      aModelSelectorSelect.onchange();
      return aModelsInfo;
    } else {
      if (aSelectedModelIndex !== -1) {
        const anInfo = aModelsInfo[aSelectedModelIndex];
        onModelChanged(anInfo.path, anInfo.name);
      }
    }
  }
