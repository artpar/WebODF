/**
 * Copyright (C) 2010-2014 KO GmbH <copyright@kogmbh.com>
 *
 * @licstart
 * This file is part of WebODF.
 *
 * WebODF is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License (GNU AGPL)
 * as published by the Free Software Foundation, either version 3 of
 * the License, or (at your option) any later version.
 *
 * WebODF is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with WebODF.  If not, see <http://www.gnu.org/licenses/>.
 * @licend
 *
 * @source: http://www.webodf.org/
 * @source: https://github.com/kogmbh/WebODF/
 */

/*global webodfcore, runtime*/

(function() {
    "use strict";
    /** @type {!RedrawTasks} */
    var redrawTasks;

    /**
     * FF doesn't execute requestAnimationFrame requests before it's next repaint,
     * causing flickering when performing some types of updates (e.g., recomputing Style2CSS).
     * To workaround this, sometimes we force animation callbacks to redraw ourselves
     * at certain points.
     *
     * This object collects animation frame requests and provides
     * a safe way of executing any outstanding requests
     *
     * @constructor
     */
    function RedrawTasks() {
        var callbacks = {};

        /**
         * Schedule a callback to be invoked on the next animation frame, or
         * when performRedraw is called.
         *
         * @param {!function():undefined} callback
         * @return {!number}
         */
        this.requestRedrawTask = function(callback) {
            var id = runtime.requestAnimationFrame(function() {
                callback();
                delete callbacks[id];
            });
            callbacks[id] = callback;
            return id;
        };

        /**
         * Execute any pending animation frame callbacks and cancel their
         * browser animation frame request.
         *
         * @return {undefined}
         */
        this.performRedraw = function() {
            Object.keys(callbacks).forEach(function(id) {
                callbacks[id]();
                runtime.cancelAnimationFrame(parseInt(id, 10));
            });
            callbacks = {};
        };

        /**
         * Cancel a pending animation frame callback
         * @param {!number} id
         * @return {undefined}
         */
        this.cancelRedrawTask = function(id) {
            runtime.cancelAnimationFrame(id);
            delete callbacks[id];
        };
    }

    /**
     * @type {!Object}
     */
    webodfcore.Task =  {};

    /**
     * Disable manually processing of tasks when webodfcore.Task.processTasks is called.
     * This is only used during benchmarks to prevent caret redraws from skewing
     * the resulting numbers
     * @type {!boolean}
     */
    webodfcore.Task.SUPPRESS_MANUAL_PROCESSING = false;

    /**
     * Process any outstanding redraw tasks that may be queued up
     * waiting for an animation frame
     * 
     * @return {undefined}
     */
    webodfcore.Task.processTasks = function() {
        if (!webodfcore.Task.SUPPRESS_MANUAL_PROCESSING) {
            redrawTasks.performRedraw();
        }
    };

    /**
     * Creates a new task that will execute the specified callback once
     * when redrawing the next animation frame. Triggering the task multiple
     * times before the execution occurs will still only result in a single
     * call being made.
     *
     * @param {!Function} callback
     * @return {!webodfcore.ScheduledTask}
     */
    webodfcore.Task.createRedrawTask = function (callback) {
        return new webodfcore.ScheduledTask(callback,
            redrawTasks.requestRedrawTask,
            redrawTasks.cancelRedrawTask
        );
    };

    /**
     * Creates a new task that will execute the specified callback once
     * within the specified delay period. Triggering the task multiple
     * times before the execution occurs will still only result in a single
     * call being made.
     *
     * @param {!Function} callback
     * @param {!number} delay
     * @return {!webodfcore.ScheduledTask}
     */
    webodfcore.Task.createTimeoutTask = function (callback, delay) {
        return new webodfcore.ScheduledTask(callback,
            function(callback) {
                return runtime.setTimeout(callback, delay);
            },
            runtime.clearTimeout
        );
    };

    function init() {
        redrawTasks = new RedrawTasks();
    }
    init();
}());