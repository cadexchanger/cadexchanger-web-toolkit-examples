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

/**
 * ### Scene graph tree state plugin
 * Fork of jstree.checkbox
 *
 * Leaf item states:
 *   hidden -> loading - > displayed
 *                     \
 *                       > displayed_error
 *
 *   displayed -> hidden
 *   displayed_error -> hidden
 *
 * Branch point states:
 *   hidden: all child hidden
 *   visible: all child visible or visible_error
 *   loading: at least one child is loading
 *   partly_visible: at least one child is hidden
 */

/*globals jQuery, define, exports, require */
(function (factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
    define('jstree.sgestates', ['jquery', 'jstree'], factory);
  }
  else if (typeof exports === 'object') {
    factory(require('jquery'), require('jstree'));
  }
  else {
    factory(jQuery, jQuery.jstree);
  }
}(function ($) {
  'use strict';

  if ($.jstree.plugins.sgestates) { return; }

  let _i = document.createElement('I');
  _i.className = 'jstree-icon jstree-sge-state';
  _i.setAttribute('role', 'presentation');

  let _ia = document.createElement('I');
  _ia.className = 'jstree-icon jstree-sge-additional-state';
  _ia.setAttribute('role', 'presentation');
  /**
   * stores all defaults for the sgestates plugin
   * @name $.jstree.defaults.sgestates
   * @plugin sgestates
   */
  $.jstree.defaults.sgestates = {
    /**
     * This setting controls if sgestates are bound to the general tree selection or to an internal array maintained by the sgestates plugin. Defaults to `true`, only set to `false` if you know exactly what you are doing.
     * @name $.jstree.defaults.sgestates.tie_selection
     * @plugin sgestates
     */
    tie_selection: false,
  };
  $.jstree.plugins.sgestates = function (options, parent) {
    let boxStates = {
      hidden: 0x01,
      partlyDisplayed: 0x02,
      loading: 0x04,
      displayed: 0x08,

      // especial cases
      error: 0x10,
      info: 0x20,

      pmi: 0x100,

      displayed_error: 0x08 | 0x10,
      displayed_info: 0x08 | 0x20,

      // helper state
      mainStates: 0x01 | 0x02 | 0x04 | 0x08,
      additionalStates: 0x10 | 0x20,

      isHidden: function (state) {
        return state & this.hidden;
      },
      isPartlyDisplayed: function (state) {
        return state & this.partlyDisplayed;
      },
      isDisplayed: function (state) {
        return state & this.displayed;
      },
      isLoading: function (state) {
        return state & this.loading;
      },
      // state & this.additionalStates; // remove not additional flags
      // state & this.*; // add target flag
      makeHidden: function (state) {
        return (state & (~this.mainStates)) | this.hidden;
      },
      makePartlyDisplayed: function (state) {
        return (state & (~this.mainStates)) | this.partlyDisplayed;
      },
      makeDisplayed: function (state) {
        return (state & (~this.mainStates)) | this.displayed;
      },
      makeLoading: function (state) {
        return (state & (~this.mainStates)) | this.loading;
      },

      // additional state
      isInfo: function (state) {
        return state & this.info;
      },
      isError: function (state) {
        return state & this.error;
      },
      isNormal: function (state) {
        return !(state & this.additionalStates);
      },
      makeInfo: function (state) {
        return (state & (~this.additionalStates)) | this.error;
      },
      makeError: function (state) {
        return (state & (~this.additionalStates)) | this.info;
      },
      makeNormal: function (state) {
        return (state & (~this.additionalStates));
      },

      // Pmi icon
      isPmi: function (state) {
        return state & this.pmi;
      },
      makePmi: function (state, toSet) {
        if (toSet) {
          return state | this.pmi;
        } else {
          return state & (~this.pmi);
        }
      },
    };

    function findChildNodeBySelector(obj, className) {
      let i, j;
      for (i = 0, j = obj.childNodes.length; i < j; i++) {
        const aChild = obj.childNodes[i];
        if (aChild && aChild.className && aChild.className.indexOf(className) !== -1) {
          return aChild;
        }
      }
      return null;
    }

    this._makeNodeDisplayed = function (node) {
      node = this.get_node(node, true);
      if (node && node.length) {
        node.attr('aria-selected', true).children('.jstree-anchor')
          .removeClass('jstree-sge-loading')
          .removeClass('jstree-partly-displayed')
          .addClass('jstree-displayed');
      }
    };

    this._makeNodePartlyDisplayed = function (node) {
      node = this.get_node(node, true);
      if (node && node.length) {
        node.attr('aria-selected', true).children('.jstree-anchor')
          .removeClass('jstree-sge-loading')
          .addClass('jstree-partly-displayed')
          .removeClass('jstree-displayed');
      }
    };

    this._makeNodeHidden = function (node) {
      node = this.get_node(node, true);
      if (node && node.length) {
        node.attr('aria-selected', true).children('.jstree-anchor')
          .removeClass('jstree-sge-loading')
          .removeClass('jstree-partly-displayed')
          .removeClass('jstree-displayed');
      }
    };

    this._makeNodeLoading = function (node) {
      node = this.get_node(node, true);
      if (node && node.length) {
        node.attr('aria-selected', true).children('.jstree-anchor')
          .addClass('jstree-sge-loading')
          .removeClass('jstree-partly-displayed')
          .removeClass('jstree-displayed');
      }
    };

    this._addAdditionalStateIcon = function (anchorDom, tooltip) {
      if (anchorDom) {
        let icon = findChildNodeBySelector(anchorDom, 'jstree-sge-additional-state');
        if (!icon) {
          icon = _ia.cloneNode(false);
          anchorDom.appendChild(icon);
        }
        if (tooltip && tooltip.length > 0) {
          $(icon).tooltip({
            animation: false,
            title: tooltip,
            placement: 'top'
          });
        } else {
          $(icon).tooltip('dispose');
        }
      }
    };

    this._makeNodeError = function (node, rationale) {
      node = this.get_node(node, true);
      if (node && node.length) {
        node.attr('aria-selected', true).children('.jstree-anchor')
          .addClass('jstree-error')
          .removeClass('jstree-info');
        let anchor = node.children('.jstree-anchor')[0];
        this._addAdditionalStateIcon(anchor, rationale);
      }
    };

    this._makeNodeInfo = function (node, rationale) {
      node = this.get_node(node, true);
      if (node && node.length) {
        node.attr('aria-selected', true).children('.jstree-anchor')
          .removeClass('jstree-error')
          .addClass('jstree-info');
        let anchor = node.children('.jstree-anchor')[0];
        this._addAdditionalStateIcon(anchor, rationale);
      }
    };

    this._addPmiIcon = function(anchorDom, value) {
      let icon = findChildNodeBySelector(anchorDom, 'jstree-pmi-icon');
      if (value) {
        if (!icon) {
          icon = document.createElement('I');
          icon.className = 'jstree-icon jstree-pmi-icon';
          anchorDom.append(icon);
        }
        $(icon).tooltip({
          animation: false,
          title: 'Current item has PMI data.',
          placement: 'top'
        });
      } else {
        if (icon) {
          $(icon).tooltip('dispose');
          anchorDom.removeChild(icon);
        }
      }
    };

    this._makeNodePmi = function (node, value) {
      node = this.get_node(node, true);
      if (node && node.length) {
        const anAnchor = node.attr('aria-selected', true).children('.jstree-anchor');
        this._addPmiIcon(anAnchor);
      }
    };

    this._makeNodeNormal = function (node) {
      node = this.get_node(node, true);
      if (node && node.length) {
        node.attr('aria-selected', true).children('.jstree-anchor')
          .removeClass('jstree-error')
          .removeClass('jstree-info');

        let anchor = node.children('.jstree-anchor')[0];
        if (anchor) {
          let icon = findChildNodeBySelector(anchor, 'jstree-sge-additional-state');
          if (icon) {
            $(icon).tooltip('dispose');
            anchor.removeChild(icon);
          }
        }
      }
    };

    this.bind = function () {
      parent.bind.call(this);
      this._data.sgestates.uto = false;
      this._data.sgestates.displayed = [];
      this._data.sgestates.loading = [];
      this.settings.sgestates.cascade = 'up+down+undetermined+loading';
      this.element
        .on('init.jstree', $.proxy(function () {
          this._data.sgestates.visible = this.settings.sgestates.visible;
        }, this))
        .on('loading.jstree', $.proxy(function () {
          this.show_state_icons();
        }, this));
      this.element
        .on('changed.jstree hide_node.jstree display_node.jstree hide_all.jstree display_all.jstree move_node.jstree copy_node.jstree redraw.jstree open_node.jstree', $.proxy(function () {
          // only if undetermined is in setting
          if (this._data.sgestates.uto) {
            clearTimeout(this._data.sgestates.uto);
          }
          //this._data.sgestates.uto = setTimeout($.proxy(this._checkUndeterminedStates, this), 50);
        }, this));

      this.element
        .on('model.jstree', $.proxy(function (e, data) {
          let modelData = this._model.data,
            dpc = data.nodes,
            i, j, tmp;
          for (i = 0, j = dpc.length; i < j; i++) {
            tmp = modelData[dpc[i]];
            tmp.state.boxState = tmp.state.boxState || boxStates.hidden;
          }
        }, this));

      this.element
        // event when new item has been added
        .on('model.jstree', $.proxy(function (e, data) {
          let modelData = this._model.data,
            parent = modelData[data.parent],
            dpc = data.nodes,
            chd = [],
            c, i, j, k, l,
            displayedNodes = this._data.sgestates.displayed;

          // apply down
          if (boxStates.isDisplayed(parent.state.boxState)) {
            for (i = 0, j = dpc.length; i < j; i++) {
              modelData[dpc[i]].state.boxState = boxStates.displayed;
            }
            Array.prototype.push.apply(displayedNodes, dpc);
          } else {
            for (i = 0, j = dpc.length; i < j; i++) {
              if (boxStates.isDisplayed(modelData[dpc[i]].state.boxState)) {
                for (k = 0, l = modelData[dpc[i]].children_d.length; k < l; k++) {
                  modelData[modelData[dpc[i]].children_d[k]].state.boxState = boxStates.displayed;
                }
                Array.prototype.push.apply(displayedNodes, modelData[dpc[i]].children_d);
              }
            }
          }

          // apply up
          for (i = 0, j = parent.children_d.length; i < j; i++) {
            if (!modelData[parent.children_d[i]].children.length) {
              chd.push(modelData[parent.children_d[i]].parent);
            }
          }
          chd = $.vakata.array_unique(chd);
          for (k = 0, l = chd.length; k < l; k++) {
            parent = modelData[chd[k]];
            while (parent && parent.id !== $.jstree.root) {
              c = 0;
              for (i = 0, j = parent.children.length; i < j; i++) {
                c += boxStates.isDisplayed(modelData[parent.children[i]].state.boxState) ? 1 : 0;
              }
              if (c === j) {
                parent.state.boxState = boxStates.displayed;
                this._data.sgestates.displayed.push(parent.id);
                this._makeNodeDisplayed(parent);
              }
              else {
                break;
              }
              parent = this.get_node(parent.parent);
            }
          }
          // Merge displayed
          this._data.sgestates.displayed = $.vakata.array_unique(this._data.sgestates.displayed);
        }, this))

        .on('display_node.jstree', $.proxy(function (e, data) {
          let node = data.node,
            displayedNode = this._model.data,
            parent, i, j, k, l,
            displayedNodes = this._data.sgestates.displayed;

          // apply down
          let newSelected = this._cascade_displayed_state(node.id, true);
          Array.prototype.push.apply(displayedNodes, newSelected);

          // apply up
          for (i = 0, j = node.parents.length; i < j; i++) {
            parent = displayedNode[node.parents[i]];
            let hasLoading = false;
            let hasPartlyDisplayed = false;
            let displayedCount = 0;
            for (k = 0, l = parent.children.length; k < l; k++) {
              hasLoading = hasLoading || boxStates.isLoading(displayedNode[parent.children[k]].state.boxState);
              if (hasLoading) {
                break;
              }
              if (boxStates.isDisplayed(displayedNode[parent.children[k]].state.boxState)) {
                displayedCount++;
              }
              hasPartlyDisplayed = hasPartlyDisplayed || boxStates.isPartlyDisplayed(displayedNode[parent.children[k]].state.boxState);
            }
            if (displayedCount === l) {
              parent.state.boxState = boxStates.makeDisplayed(parent.state.boxState);
              displayedNodes.push(parent.id);
              this._makeNodeDisplayed(parent);
            } else if (hasLoading) {
              parent.state.boxState = boxStates.makeLoading(parent.state.boxState);
              this._makeNodeLoading(parent);
            } else if (displayedCount > 0 || hasPartlyDisplayed) {
              parent.state.boxState = boxStates.makePartlyDisplayed(parent.state.boxState);
              this._makeNodePartlyDisplayed(parent);
            } else {
              parent.state.boxState = boxStates.makeHidden(parent.state.boxState);
              this._makeNodeHidden(parent);
            }
            // else ... changing state is not required
          }

          this._data.sgestates.displayed = $.vakata.array_unique(displayedNodes);
        }, this))

        .on('hide_node.jstree', $.proxy(function (e, data) {
          let hiddenNode = data.node,
            modelData = this._model.data,
            parent, i, j, k, l, tmp,
            displayedNodes = this._data.sgestates.displayed;

          // apply down
          let newUnselected = this._cascade_displayed_state(hiddenNode.id, false);
          // remove unselected items
          displayedNodes = displayedNodes.filter(function (id) {
            return newUnselected.indexOf(id) === -1;
          });

          // apply up
          for (i = 0, j = hiddenNode.parents.length; i < j; i++) {
            parent = modelData[hiddenNode.parents[i]];
            displayedNodes = $.vakata.array_remove_item(displayedNodes, parent.id);
            tmp = this.get_node(parent, true);
            // remove display class only
            if (tmp && tmp.length) {
              tmp.attr('aria-selected', true).children('.jstree-anchor')
                .removeClass('jstree-displayed');
            }
            for (k = 0, l = parent.children.length; k < l; k++) {
              if (!boxStates.isHidden(modelData[parent.children[k]].state.boxState)) {
                break;
              }
            }
            if (k === l) {
              parent.state.boxState = boxStates.makeHidden(parent.state.boxState);
              this._makeNodeHidden(parent);
            } else if (boxStates.isDisplayed(parent.state.boxState)) {
              parent.state.boxState = boxStates.makePartlyDisplayed(parent.state.boxState);
              this._makeNodePartlyDisplayed(parent);
            }
            // else ... changing state is not required
          }
          this._data.sgestates.displayed = displayedNodes;
        }, this))

        .on('loading_node.jstree', $.proxy(function (e, data) {
          let loadingNode = data.node,
            modelData = this._model.data,
            parent, i, j,
            displayedNodes = this._data.sgestates.displayed;

          // apply to current node
          this._makeNodeLoading(loadingNode);
          // only apply up
          for (i = 0, j = loadingNode.parents.length; i < j; i++) {
            parent = modelData[loadingNode.parents[i]];
            parent.state.boxState = boxStates.makeLoading(parent.state.boxState);
            displayedNodes = $.vakata.array_remove_item(displayedNodes, parent.id);
            this._makeNodeLoading(parent);
          }
          this._data.sgestates.displayed = displayedNodes;
        }, this))

        .on('info_node.jstree', $.proxy(function (e, data) {
          let infoNode = data.node,
            modelData = this._model.data,
            parent, i, j;

          this._makeNodeInfo(infoNode, data.rationale);

          // only apply up
          for (i = 0, j = infoNode.parents.length; i < j; i++) {
            parent = modelData[infoNode.parents[i]];
            parent.state.boxState = boxStates.makeInfo(parent.state.boxState);
            parent.rationale = data.rationale;
            this._makeNodeInfo(parent, parent.rationale);
          }
        }, this))

        .on('error_node.jstree', $.proxy(function (e, data) {
          let errorNode = data.node,
            modelData = this._model.data,
            parent, i, j;

          this._makeNodeError(errorNode, data.rationale);
          // only apply up
          for (i = 0, j = errorNode.parents.length; i < j; i++) {
            parent = modelData[errorNode.parents[i]];
            parent.state.boxState = boxStates.makeError(parent.state.boxState);
            parent.rationale = data.rationale;
            this._makeNodeError(parent, parent.rationale);
          }
        }, this))

        .on('pmi_node.jstree', $.proxy(function (e, data) {
          this._makeNodePmi(data.node, data.value);
        }, this))

        .on('normal_node.jstree', $.proxy(function (e, data) {
          let normalNode = data.node,
            modelData = this._model.data,
            parent, i, j;

          this._makeNodeNormal(normalNode);
          // only apply up
          for (i = 0, j = normalNode.parents.length; i < j; i++) {
            parent = modelData[normalNode.parents[i]];
            parent.state.boxState = boxStates.makeNormal(parent.state.boxState);
            this._makeNodeNormal(parent);
          }
        }, this))

        .on('hide_all.jstree', $.proxy(function (e, data) {
          console.error('TODO: Implement if needed');
          // TODO: implement
          // let obj = this.get_node($.jstree.root),
          //   m = this._model.data,
          //   i, j, tmp;
          // for (i = 0, j = obj.children_d.length; i < j; i++) {
          //   tmp = m[obj.children_d[i]];
          //   if (tmp && tmp.original && tmp.original.state && tmp.original.state.undetermined) {
          //     tmp.original.state.undetermined = false;
          //   }
          // }
        }, this));
    };


    this.redraw_node = function (obj, deep, is_callback, force_render) {
      obj = parent.redraw_node.apply(this, arguments);
      if (obj) {
        let i, j, tmp = null, icon = null;
        for (i = 0, j = obj.childNodes.length; i < j; i++) {
          if (obj.childNodes[i] && obj.childNodes[i].className && obj.childNodes[i].className.indexOf('jstree-anchor') !== -1) {
            tmp = obj.childNodes[i];
            break;
          }
        }
        if (tmp) {
          let state = this._model.data[obj.id].state.boxState;
          if (boxStates.isDisplayed(state)) tmp.className += ' jstree-displayed';
          if (boxStates.isLoading(state)) tmp.className += ' jstree-sge-loading';
          if (boxStates.isPartlyDisplayed(state)) tmp.className += ' jstree-partly-displayed';
          if (boxStates.isInfo(state)) {
            tmp.className += ' jstree-info';
            this._addAdditionalStateIcon(tmp, this._model.data[obj.id].rationale);
          }
          if (boxStates.isError(state)) {
            tmp.className += ' jstree-error';
            this._addAdditionalStateIcon(tmp, this._model.data[obj.id].rationale);
          }
          if (boxStates.isPmi(state)) {
            tmp.className += ' jstree-pmi';
            this._addPmiIcon(tmp, true);
          }
          icon = _i.cloneNode(false);
          if (this._model.data[obj.id].state.sge_state_disabled) { icon.className += ' jstree-sge-state-disabled'; }
          tmp.insertBefore(icon, tmp.childNodes[0]);
        }
      }
      return obj;
    };
    /**
     * show the node sgestates icons
     * @name show_state_icons()
     * @plugin sgestates
     */
    this.show_state_icons = function () {
      this._data.core.themes.stateIcons = true;
      this.get_container_ul().removeClass('jstree-no-state-icons');
    };
    /**
     * hide the node sgestates icons
     * @name hide_checkboxes()
     * @plugin sgestates
     */
    this.hide_state_icons = function () {
      this._data.core.themes.stateIcons = false;
      this.get_container_ul().addClass('jstree-no-state-icons');
    };
    /**
     * toggle the node icons
     * @name toggle_checkboxes()
     * @plugin sgestates
     */
    this.toggle_checkboxes = function () {
      if (this._data.core.themes.stateIcons) {
        this.hide_checkboxes();
      } else {
        this.show_state_icons();
      }
    };
    /**
     * checks if a node is in an loading state
     * @name is_undeterminedState(obj)
     * @param  {mixed} obj
     * @return {Boolean}
     */
    this.is_loadingState = function (obj) {
      obj = this.get_node(obj);
      return obj && boxStates.isLoading(obj.state.boxState);
    };

    /**
     * checks if a node is in an partlyDisplayed state
     * @name is_undeterminedState(obj)
     * @param  {mixed} obj
     * @return {Boolean}
     */
    this.is_partlyDisplayedState = function (obj) {
      obj = this.get_node(obj);
      return obj && boxStates.isPartlyDisplayed(obj.state.boxState);
    };

    this.activate_node = function (obj, e) {
      // if ($(e.target).hasClass('jstree-sgestates-disabled')) {
      //   return false;
      // }
      if ($(e.target).hasClass('jstree-pmi-icon')) {
        this.trigger('activate_pmi', { 'node': this.get_node(obj) });
      }
      if ((!$(e.target).hasClass('jstree-sge-state'))) {
        return parent.activate_node.call(this, obj, e);
      }
      let node = this.get_node(obj);
      if (this.is_disabled(obj) || boxStates.isLoading(node.state.boxState)) {
        return false;
      }
      let displayed = false;
      if (boxStates.isDisplayed(node.state.boxState) || boxStates.isPartlyDisplayed(node.state.boxState)) {
        this.hide_node(obj, e);
      } else if (boxStates.isHidden(node.state.boxState)) {
        this.display_node(obj, e);
        displayed = true;
      }
      this.trigger('activate_node', { 'node': node, 'displayed': displayed });
    };

    /**
     * Change state all descendants and itself.
     * @param id
     * @param {Boolean} displayed indicates should be items displayed or hidden
     * @returns {Array} Array of all node id's (in this tree branch) that are boxstate.
     */
    this._cascade_displayed_state = function (id, displayed) {
      let self = this;
      let node = this._model.data[id];
      let newStatedNodeIds = [];

      // Change state of children
      if (node.children) {
        node.children.forEach(function (childId) {
          let newStatedChildIds = self._cascade_displayed_state(childId, displayed);
          newStatedNodeIds = newStatedNodeIds.concat(newStatedChildIds);
        });
      }

      newStatedNodeIds.push(node.id);

      if (displayed) {
        node.state.boxState = boxStates.makeDisplayed(node.state.boxState);
        this._makeNodeDisplayed(node);
      } else {
        node.state.boxState = boxStates.makeHidden(node.state.boxState);
        this._makeNodeHidden(node);
      }

      return newStatedNodeIds;
    };

    /**
     * Set state to displayed for node
     * @name display_node(obj)
     * @param {mixed} obj an array can be used to check multiple nodes
     * @trigger display_node.jstree
     * @plugin sgestates
     */
    this.display_node = function (obj, e) {
      let t1, t2;
      if ($.isArray(obj)) {
        obj = obj.slice();
        for (t1 = 0, t2 = obj.length; t1 < t2; t1++) {
          this.display_node(obj[t1], e);
        }
        return true;
      }
      obj = this.get_node(obj);
      if (!obj || obj.id === $.jstree.root) {
        return false;
      }
      if (!boxStates.isDisplayed(obj.state.boxState)) {
        obj.state.boxState = boxStates.makeDisplayed(obj.state.boxState);
        //this._data.sgestates.displayed.push(obj.id);
        /**
         * triggered when an node change sge state to displayed
         * @event
         * @name display_node.jstree
         * @param {Object} node
         * @param {Array} displayed the current displayed
         * @param {Object} event the event (if any) that triggered this display_node
         * @plugin sgestates
         */
        this.trigger('display_node', { 'node': obj, 'displayed': this._data.sgestates.displayed, 'event': e });
      }
    };

    /**
     * hide a node
     * Set state to hidden for node
     * @param {mixed} obj an array can be used to hide multiple nodes
     * @trigger hide_node.jstree
     * @plugin sgestates
     */
    this.hide_node = function (obj, e) {
      let t1, t2;
      if ($.isArray(obj)) {
        obj = obj.slice();
        for (t1 = 0, t2 = obj.length; t1 < t2; t1++) {
          this.hide_node(obj[t1], e);
        }
        return true;
      }
      obj = this.get_node(obj);
      if (!obj || obj.id === $.jstree.root) {
        return false;
      }
      if (!boxStates.isHidden(obj.state.boxState)) {
        obj.state.boxState = boxStates.makeHidden(obj.state.boxState);
        //this._data.sgestates.displayed = $.vakata.array_remove_item(this._data.sgestates.displayed, obj.id);
        /**
         * triggered when an node change sge state to hidden
         * @event
         * @name hide_node.jstree
         * @param {Object} node
         * @param {Array} displayed the current displayed
         * @param {Object} event the event (if any) that triggered this hide_node
         * @plugin sgestates
         */
        this.trigger('hide_node', { 'node': obj, 'displayed': this._data.sgestates.displayed, 'event': e });
      }
      return true;
    };

    /**
     * Set state to loading for node
     * @name loading_node(obj)
     * @param {mixed} obj an array can be used to loading multiple nodes
     * @trigger loading_node.jstree
     * @plugin sgestates
     */
    this.loading_node = function (obj, e) {
      let t1, t2;
      if ($.isArray(obj)) {
        obj = obj.slice();
        for (t1 = 0, t2 = obj.length; t1 < t2; t1++) {
          this.loading_node(obj[t1], e);
        }
        return true;
      }
      obj = this.get_node(obj);
      if (!obj || obj.id === $.jstree.root || (obj.children && obj.children.length > 0)) {
        // can be called for leaf
        return false;
      }
      if (!boxStates.isLoading(obj.state.boxState)) {
        obj.state.boxState = boxStates.makeLoading(obj.state.boxState);
        //this._data.sgestates.displayed = $.vakata.array_remove_item(this._data.sgestates.displayed, obj.id);
        /**
         * triggered when an node change sge state to loading
         * @event
         * @name hide_node.jstree
         * @param {Object} node
         * @param {Array} displayed the current displayed
         * @param {Object} event the event (if any) that triggered this hide_node
         * @plugin sgestates
         */
        this.trigger('loading_node', { 'node': obj, 'displayed': this._data.sgestates.displayed, 'event': e });
      }
      return true;
    };

    /**
     * Add error flag for node
     * @name error_node(obj)
     * @param {mixed} obj an array can be used to be applied to multiple nodes
     ** @param {String} rationale a string
     * @trigger error_node.jstree
     * @plugin sgestates
     */
    this.error_node = function (obj, rationale) {
      let t1, t2;
      if ($.isArray(obj)) {
        obj = obj.slice();
        for (t1 = 0, t2 = obj.length; t1 < t2; t1++) {
          this.error_node(obj[t1], rationale);
        }
        return true;
      }
      obj = this.get_node(obj);
      if (!obj || obj.id === $.jstree.root || (obj.children && obj.children.length > 0)) {
        // can be called for leaf
        return false;
      }
      if (!boxStates.isError(obj.state.boxState)) {
        obj.state.boxState = boxStates.makeError(obj.state.boxState);
        obj.rationale = rationale;
        /**
         * triggered when an node change sge state to "error"
         * @event
         * @name error_node.jstree
         * @param {Object} node
         * @param {String} rationale the rationale of the error state
         * @plugin sgestates
         */
        this.trigger('error_node', { 'node': obj, 'rationale': rationale });
      }
      return true;
    };

    /**
     * Add info flag for node
     * @name info_node(obj)
     * @param {mixed} obj an array can be used to be applied to multiple nodes
     * @param {String} rationale a string
     * @trigger info_node.jstree
     * @plugin sgestates
     */
    this.info_node = function (obj, rationale) {
      let t1, t2;
      if ($.isArray(obj)) {
        obj = obj.slice();
        for (t1 = 0, t2 = obj.length; t1 < t2; t1++) {
          this.info_node(obj[t1], rationale);
        }
        return true;
      }
      obj = this.get_node(obj);
      if (!obj || obj.id === $.jstree.root || (obj.children && obj.children.length > 0)) {
        // can be called for leaf
        return false;
      }
      if (!boxStates.isInfo(obj.state.boxState)) {
        obj.state.boxState = boxStates.makeInfo(obj.state.boxState);
        obj.rationale = rationale;
        /**
         * triggered when an node change sge state to "info"
         * @event
         * @name info_node.jstree
         * @param {Object} node
         * @param {String} rationale the rationale of the info state
         * @plugin sgestates
         */
        this.trigger('info_node', { 'node': obj, 'rationale': rationale });
      }
      return true;
    };

    /**
     * Add PMI flag for node
     * @name pmi_node(obj)
     * @param {mixed} obj an array can be used to be applied to multiple nodes
     * @param {boolean} value a string
     * @trigger pmi_node.jstree
     * @plugin sgestates
     */
    this.pmi_node = function (obj, value) {
      let t1, t2;
      if ($.isArray(obj)) {
        obj = obj.slice();
        for (t1 = 0, t2 = obj.length; t1 < t2; t1++) {
          this.pmi_node(obj[t1], value);
        }
        return true;
      }
      obj = this.get_node(obj);
      // if (!obj || obj.id === $.jstree.root || (obj.children && obj.children.length > 0)) {
      //   // can be called for leaf
      //   return false;
      // }
      if (boxStates.isPmi(obj.state.boxState) !== value) {
        obj.state.boxState = boxStates.makePmi(obj.state.boxState, value);
        /**
         * triggered when an node change sge state to "info"
         * @event
         * @name pmi_node.jstree
         * @param {Object} node
         * @param {String} rationale the rationale of the info state
         * @plugin sgestates
         */
        this.trigger('pmi_node', { 'node': obj, value: value });
      }
      return true;
    };

    /**
     * Remove info and error flag for node
     * @name normal_node(obj)
     * @param {mixed} obj an array can be used to hide multiple nodes
     * @trigger normal_node.jstree
     * @plugin sgestates
     */
    this.normal_node = function (obj) {
      let t1, t2;
      if ($.isArray(obj)) {
        obj = obj.slice();
        for (t1 = 0, t2 = obj.length; t1 < t2; t1++) {
          this.normal_node(obj[t1]);
        }
        return true;
      }
      obj = this.get_node(obj);
      if (!obj || obj.id === $.jstree.root || (obj.children && obj.children.length > 0)) {
        // can be called for leaf
        return false;
      }
      if (!boxStates.isNormal(obj.state.boxState)) {
        obj.state.boxState = boxStates.makeNormal(obj.state.boxState);
        delete obj.rationale;
        /**
         * triggered when an node change sge state to "normal"
         * @event
         * @name normal_node.jstree
         * @param {Object} node
         * @plugin sgestates
         */
        this.trigger('normal_node', { 'node': obj });
      }
      return true;
    };

    /**
     * checks if a node is displayed (if tie_selection is on in the settings this function will return the same as is_selected)
     * @name is_displayed(obj)
     * @param  {mixed}  obj
     * @return {Boolean}
     * @plugin sgestates
     */
    this.is_displayed = function (obj) {
      obj = this.get_node(obj);
      if (!obj || obj.id === $.jstree.root) { return false; }
      return boxStates.isDisplayed(obj.state.boxState);
    };

  };

  // include the sgestates plugin by default
  // $.jstree.defaults.plugins.push("sgestates");
}));
