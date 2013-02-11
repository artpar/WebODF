/**
 * Copyright (C) 2012 KO GmbH <copyright@kogmbh.com>

 * @licstart
 * The JavaScript code in this page is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License
 * (GNU AGPL) as published by the Free Software Foundation, either version 3 of
 * the License, or (at your option) any later version.  The code is distributed
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU AGPL for more details.
 *
 * As additional permission under GNU AGPL version 3 section 7, you
 * may distribute non-source (e.g., minimized or compacted) forms of
 * that code without the copy of the GNU GPL normally required by
 * section 4, provided you include this license notice and a URL
 * through which recipients can access the Corresponding Source.
 *
 * As a special exception to the AGPL, any HTML file which merely makes function
 * calls to this code, and for that purpose includes it by reference shall be
 * deemed a separate work for copyright law purposes. In addition, the copyright
 * holders of this code give you permission to combine this code with free
 * software libraries that are released under the GNU LGPL. You may copy and
 * distribute such a system following the terms of the GNU AGPL for this code
 * and the LGPL for the libraries. If you modify this code, you may extend this
 * exception to your version of the code, but you are not obligated to do so.
 * If you do not wish to do so, delete this exception statement from your
 * version.
 *
 * This license applies to this entire compilation.
 * @licend
 * @source: http://www.webodf.org/
 * @source: http://gitorious.org/webodf/webodf/
 */

/*global runtime, core, gui, ops, odf*/

runtime.loadClass("ops.TrivialOperationRouter");
runtime.loadClass("gui.SelectionManager");
/**
 * A document that keeps all data related to the mapped document.
 * @constructor
 * @param {!odf.OdfCanvas} odfCanvas
 */
ops.Document = function Document(odfCanvas) {
    "use strict";

    var self = this,
        textns = "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
        fons = "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
        stylens = "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
        rootNode,
        selectionManager,
        filter,
        cursors = {},
        eventListener = {};
    
    eventListener.paragraphEdited = [];
    /**
     * @constructor
     * @implements {core.PositionFilter}
     */
    function TextPositionFilter() {
        var /**@const*/accept = core.PositionFilter.FilterResult.FILTER_ACCEPT,
            /**@const*/reject = core.PositionFilter.FilterResult.FILTER_REJECT;
        /**
         * @param {!core.PositionIterator} iterator
         * @return {core.PositionFilter.FilterResult}
         */
        this.acceptPosition = function (iterator) {
            var n = iterator.container(), p, o, d;
            // only stop in text nodes or at end of <p>, <h> o <span/>
            if (n.nodeType !== 3) {
                if (n.localName !== "p" && n.localName !== "h" && n.localName !== "span") {
                    return reject;
                }
                return accept;
            }
            if (n.length === 0) {
                return reject;
            }
            // only stop in text nodes in 'p', 'h' or 'span' elements
            p = n.parentNode;
            o = p && p.localName;
            if (o !== "p" && o !== "span" && o !== "h") {
                return reject;
            }
            // do not stop between spaces
            o = iterator.textOffset();
            if (o > 0 && iterator.substr(o - 1, 2) === "  ") {
                return reject;
            }
            return accept;
        };
    }
    /**
     * @param {!odf.OdfContainer} odfcontainer
     */
    function findTextRoot(odfcontainer) {
        // set the root node to be the text node
        var root = odfcontainer.rootElement.firstChild;
        while (root && root.localName !== "body") {
            root = root.nextSibling;
        }
        root = root && root.firstChild;
        while (root && root.localName !== "text") {
            root = root.nextSibling;
        }
        return root;
    }
    /**
     * This function will iterate through positions allowed by the position
     * iterator and count only the text positions. When the amount defined by
     * offset has been counted, the Text node that that position is returned
     * as well as the offset in that text node.
     * @param {!number} position
     * @return {?{textNode: !Text, offset: !number}}
     */
    function getPositionInTextNode(position) {
        var iterator = gui.SelectionMover.createPositionIterator(rootNode),
            lastTextNode = null,
            node,
            nodeOffset = 0;
        position += 1; // add one because we check for position === 0
        // iterator should be at the start of rootNode
        if (filter.acceptPosition(iterator) === 1) {
            node = iterator.container();
            if (node.nodeType === 3) {
                lastTextNode = /**@type{!Text}*/(node);
                nodeOffset = 0;
            } else if (position === 0) {
                // create a new text node at the start of the paragraph
                lastTextNode = rootNode.ownerDocument.createTextNode('');
                node.insertBefore(lastTextNode, null);
                nodeOffset = 0;
            }
        }
        while (position > 0 || lastTextNode === null) {
            if (!iterator.nextPosition()) {
                // the desired position cannot be found
                return null;
            }
            if (filter.acceptPosition(iterator) === 1) {
                position -= 1;
                node = iterator.container();
                if (node.nodeType === 3) {
                    if (node !== lastTextNode) {
                        lastTextNode = /**@type{!Text}*/(node);
                        nodeOffset = 0;
                    } else {
                        nodeOffset += 1;
                    }
                } else if (lastTextNode !== null) {
                    if (position === 0) {
                        nodeOffset = lastTextNode.length;
                        break;
                    }
                    lastTextNode = null;
                } else if (position === 0) {
                    lastTextNode = node.ownerDocument.createTextNode('');
                    node.appendChild(lastTextNode);
                    nodeOffset = 0;
                    break;
                }
            }
        }
        if (lastTextNode === null) {
            return null;
        }
        // if the position is just after a cursor, then move in front of that
        // cursor
        while (nodeOffset === 0 && lastTextNode.previousSibling &&
                lastTextNode.previousSibling.localName === "cursor") {
            node = lastTextNode.previousSibling.previousSibling;
            while (node && node.nodeType !== 3) {
                node = node.previousSibling;
            }
            if (node === null) {
                node = rootNode.ownerDocument.createTextNode('');
                lastTextNode.parentNode.insertBefore(node,
                        lastTextNode.parentNode.firstChild);
            }
            lastTextNode = /**@type{!Text}*/(node);
            nodeOffset = lastTextNode.length;
        }
        return {textNode: lastTextNode, offset: nodeOffset };
    }

    /**
     * @param {?Node} node
     * @return {?Node}
     */
    function getParagraphElement(node) {
        while (node && !((node.localName === "p" || node.localName === "h") && node.namespaceURI === textns)) {
            node = node.parentNode;
        }
        return node;
    }

    /**
     * @param {!String} styleName
     * @return {?Node}
     */
    function getParagraphStyleElement(styleName) {
        var node;
        node = odfCanvas.getFormatting().getStyleElement(odfCanvas.odfContainer().rootElement.styles, styleName, 'paragraph');
        return node;
    }
    
    /**
     * @param {!String} styleName
     * @return {?Object}
     */
    function getParagraphStyleAttributes(styleName) {
        var node = getParagraphStyleElement(styleName);
        if (node) {
            return odfCanvas.getFormatting().getInheritedStyleAttributes(odfCanvas.odfContainer().rootElement.styles, node);
        }

        return null;
    }

    this.getParagraphStyleElement = getParagraphStyleElement;

    this.getParagraphElement = getParagraphElement;

    /**
     * This method returns the style attributes for a given stylename, including all properties
     * inherited from any parent styles, and also the Default style in the family.
     * @param {!String} styleName
     * @return {?Object}
     */
    this.getParagraphStyleAttributes = getParagraphStyleAttributes;

    /**
     * This function will return the Text node as well as the offset in that text node
     * of the cursor.
     * @param {!number} position
     * @return {?{textNode: !Text, offset: !number}}
     */
    this.getPositionInTextNode = getPositionInTextNode;

    /**
     * This function calculates the steps in ODF world between the cursor of the member and the given position in the DOM.
     * @param {!string} memberid
     * @param {!Node} node
     * @param {!number} offset
     * @return {!number}
     */
    this.getDistanceFromCursor = function (memberid, node, offset) {
        var counter,
            cursor = cursors[memberid],
            steps = 0;
        runtime.assert(node !== null, "Document.getDistanceFromCursor called with node===null");
        if (cursor) {
            counter = cursor.getStepCounter().countStepsToPosition;
            steps = counter(node, offset, filter);
        }
        return steps;
    };
    /**
     * This function returns the position in ODF world of the cursor of the member.
     * @param {!string} memberid
     * @return {!number}
     */
    this.getCursorPosition = function (memberid) {
        return -self.getDistanceFromCursor(memberid, rootNode, 0);
    };

    /**
     * @return {!core.PositionFilter}
     */
    this.getPositionFilter = function () {
        return filter;
    };

    this.getOdfCanvas = function () {
        return odfCanvas;
    };

    /**
     * @return {!Node}
     */
    this.getRootNode = function () {
        return rootNode;
    };
    /**
     * @return {!Document}
     */
    this.getDOM = function () {
        return rootNode.ownerDocument;
    };
    /**
    * @return {gui.SelectionManager}
    */
    this.getSelectionManager = function () {
        return selectionManager;
    };
    /**
     * @param {!string} memberid
     * @param {!number} position
     * @param {!string} text
     * @return {!boolean}
     */
    this.insertText = function (memberid, position, text) {
        var domPosition;
        domPosition = getPositionInTextNode(position);
        if (domPosition) {
            domPosition.textNode.insertData(domPosition.offset, text);
            // FIXME care must be taken regarding the cursor positions
            // the new text must appear in front of the (own) cursor.
            // if there are/were other cursors at the same address,
            // those must not move along.
            // conclusion: insert text BEHIND ALL CURSORS, then move
            // the `memberid`-cursor behind new text; alternatively
            // move `memberid`-cursor behind all cursors at the same
            // position. then insert text before `memberid`-cursor.
            self.emit('paragraphEdited', {
                element: getParagraphElement(domPosition.textNode),
                memberId: memberid
            });
            return true;
        }
        return false;
    };
    /**
     * @param {!string} memberid
     * @param {!number} position
     * @param {!number} length
     * @return {!boolean}
     */
    this.removeText = function (memberid, position, length) {
        var domPosition;
        if (length < 0) {
            length = -length;
            position -= length;
            domPosition = getPositionInTextNode(position);
        } else {
            // get avatars next textnode sibling
            domPosition = getPositionInTextNode(position + 1);
            // FIXME: this is dirty and assumes the cursor in place.
            // actually it will only work correctly with a `length` of 1
            // or with a `length` > 1 iff no avatar or other XML element
            // is within the deletion range.
            // a real implementation of this method should work
            // independently of the cursor or other XML elements.
            // (right now getPositionInTextNode will always return an
            // offset==textnode.length if the (or any) cursor is right
            // before the deletion position; that is because the
            // avatar splits the textnode)
            // the real implementation needs to delete all characters
            // between (walkable) position and position+length with no
            // (but preserving) other XML elements. by definition of
            // walkability, the amount of deleted characters will be
            // exactly `length` (but the actual deleted characters can
            // have arbitrary XML tags between them)
            //
            if (domPosition.offset !== 1) {
                runtime.log("unexpected!");
                return false;
            }
            domPosition.offset -= 1;
        }
        if (domPosition) {
            domPosition.textNode.deleteData(domPosition.offset, length);
            self.emit('paragraphEdited', {
                element: getParagraphElement(domPosition.textNode),
                memberId: memberid
            });
            return true;
        }
        return false;
    };

    /**
     * @param {!string} memberid
     * @param {!number} position
     * @param {!string} styleNameBefore
     * @param {!string} styleNameAfter
     * @return {!boolean}
     */
    this.setParagraphStyle = function (memberid, position, styleNameBefore, styleNameAfter) {
        var domPosition, paragraphNode;
        // TODO: reusing getPositionInTextNode and getParagraphElement, not an optimized solution
        domPosition = getPositionInTextNode(position);
runtime.log("Setting paragraph style:" + domPosition + " -- " + position + " " + styleNameBefore + "->" + styleNameAfter);
        if (domPosition) {
            paragraphNode = getParagraphElement(domPosition.textNode);
            if (paragraphNode) {
                paragraphNode.setAttributeNS(textns, 'text:style-name', styleNameAfter);
                self.emit('paragraphEdited', {
                    element: paragraphNode,
                    memberId: memberid
                });
                return true;
            }
        }
        return false;
    };
    
    /**
     * @param {!String} styleName
     * @param {!Object} info
     * @return {!boolean}
     * @notypecheck
     */
    this.updateParagraphStyle = function (styleName, info) {
        var styleNode, paragraphPropertiesNode, textPropertiesNode;
        styleNode = getParagraphStyleElement(styleName);

        if (styleNode) {
            paragraphPropertiesNode = styleNode.getElementsByTagNameNS(stylens, 'paragraph-properties')[0];
            textPropertiesNode = styleNode.getElementsByTagNameNS(stylens, 'text-properties')[0];
            
            if (paragraphPropertiesNode === undefined) {
                paragraphPropertiesNode = rootNode.ownerDocument.createElementNS(stylens, 'style:paragraph-properties');
                styleNode.appendChild(paragraphPropertiesNode);
            }
            if (textPropertiesNode === undefined) {
                textPropertiesNode = rootNode.ownerDocument.createElementNS(stylens, 'style:text-properties');
                styleNode.appendChild(textPropertiesNode);
            }

            paragraphPropertiesNode.setAttributeNS(fons, 'fo:margin-top', info.paragraphProperties.topMargin + 'mm');
            paragraphPropertiesNode.setAttributeNS(fons, 'fo:margin-bottom', info.paragraphProperties.bottomMargin + 'mm');
            paragraphPropertiesNode.setAttributeNS(fons, 'fo:margin-left', info.paragraphProperties.leftMargin + 'mm');
            paragraphPropertiesNode.setAttributeNS(fons, 'fo:margin-right', info.paragraphProperties.rightMargin + 'mm');
            paragraphPropertiesNode.setAttributeNS(fons, 'fo:text-align', info.paragraphProperties.alignment);
            
            textPropertiesNode.setAttributeNS(fons, 'fo:font-size', info.textProperties.fontSize + 'pt');
            textPropertiesNode.setAttributeNS(fons, 'fo:font-family', info.textProperties.fontFamily);
            textPropertiesNode.setAttributeNS(fons, 'fo:color', info.textProperties.color);
            textPropertiesNode.setAttributeNS(fons, 'fo:background-color', info.textProperties.backgroundColor);
            if (info.textProperties.textStyle.indexOf('bold') !== -1) {
                textPropertiesNode.setAttributeNS(fons, 'fo:font-weight', 'bold');
            } else {
                textPropertiesNode.setAttributeNS(fons, 'fo:font-weight', 'normal');
            }
            if (info.textProperties.textStyle.indexOf('italic') !== -1) {
                textPropertiesNode.setAttributeNS(fons, 'fo:font-style', 'italic');
            } else {
                textPropertiesNode.setAttributeNS(fons, 'fo:font-style', 'normal');
            }
            if (info.textProperties.textStyle.indexOf('underline') !== -1) {
                textPropertiesNode.setAttributeNS(stylens, 'style:text-underline-style', 'solid');
            } else {
                textPropertiesNode.setAttributeNS(stylens, 'style:text-underline-style', 'none');
            }
            
            odfCanvas.refreshCSS();
            return true;
        }

        return false;
    };
    
    this.cloneStyle = function (styleName, newStyleName) {
        var styleNode, newStyleNode;
        styleNode = getParagraphStyleElement(styleName);
        newStyleNode = styleNode.cloneNode(true);
        newStyleNode.setAttributeNS(stylens, 'style:name', newStyleName);
        newStyleNode.setAttributeNS(stylens, 'style:display-name', newStyleName);
        styleNode.parentNode.appendChild(newStyleNode);

        odfCanvas.refreshCSS();
    };
    
    this.deleteStyle = function (styleName) {
        var styleNode = getParagraphStyleElement(styleName);
        styleNode.parentNode.removeChild(styleNode);

        odfCanvas.refreshCSS();
    };

    /**
    * @param {!string} memberid
    * @return {core.Cursor}
    */
    this.getCursor = function (memberid) {
        return cursors[memberid];
    };
    /**
    * @return {!Array.<!core.Cursor>}
    */
    this.getCursors = function () {
        var list = [], i;
        for (i in cursors) {
            if (cursors.hasOwnProperty(i)) {
                list.push(cursors[i]);
            }
        }
        return list;
    };
    /**
    * @param {!core.Cursor} cursor
    */
    this.addCursor = function (cursor) {
        cursors[cursor.getMemberId()] = cursor;
    };
    /**
    * @param {!string} memberid
    */
    this.removeCursor = function (memberid) {
        var cursor = cursors[memberid],
            cursorNode;
        if (cursor) {
            // TODO: find out if nodeAfterCursor, textNodeIncrease need to be dealt with in any way
            cursor.remove(function (nodeAfterCursor, textNodeIncrease) {});
            delete cursors[memberid];
        }
    };
    /**
     * @param {!string} metadataId
     * @return {?string}
     */
    this.getMetaData = function (metadataId) {
        var node = odfCanvas.odfContainer().rootElement.firstChild;
        while (node && node.localName !== "meta") {
            node = node.nextSibling;
        }
        node = node && node.firstChild;
        while (node && node.localName !== metadataId) {
            node = node.nextSibling;
        }
        node = node && node.firstChild;
        while (node && node.nodeType !== 3) {
            node = node.nextSibling;
        }
        return node ? node.data : null;
    };
    /**
      * @return {!odf.Formatting}
      */
    this.getFormatting = function () {
        return odfCanvas.getFormatting();
    };

    this.emit = function (eventid, args) {
        var i, subscribers;
        runtime.assert(eventListener.hasOwnProperty(eventid),
            "unknown event fired \"" + eventid + "\"");
        subscribers = eventListener[eventid];
        runtime.log("firing event \"" + eventid + "\" to " + subscribers.length + " subscribers.");
        for (i = 0; i < subscribers.length; i += 1) {
            subscribers[i](args);
        }
    };

    this.subscribe = function (eventid, cb) {
        runtime.assert(eventListener.hasOwnProperty(eventid),
            "tried to subscribe to unknown event \"" + eventid + "\"");
        eventListener[eventid].push(cb);
        runtime.log("event \"" + eventid + "\" subscribed.");
    };
    /**
     * @return {undefined}
     */
    function init() {
        filter = new TextPositionFilter();
        rootNode = findTextRoot(odfCanvas.odfContainer());
        selectionManager = new gui.SelectionManager(rootNode);
    }
    init();
};
// vim:expandtab
