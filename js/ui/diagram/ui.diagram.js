import $ from "../../core/renderer";
import Widget from "../widget/ui.widget";
import Drawer from "../drawer";
import registerComponent from "../../core/component_registrator";
import { extend } from "../../core/utils/extend";
import typeUtils from '../../core/utils/type';
import dataCoreUtils from '../../core/utils/data';
import DiagramToolbar from "./ui.diagram.toolbar";
import DiagramLeftPanel from "./ui.diagram.leftpanel";
import DiagramRightPanel from "./ui.diagram.rightpanel";
import DiagramContextMenu from "./ui.diagram.contextmenu";
import DiagramToolbox from "./ui.diagram.toolbox";
import NodesOption from "./ui.diagram.nodes";
import EdgesOptions from "./ui.diagram.edges";
import Tooltip from "../tooltip";
import { getDiagram } from "./diagram_importer";
import { hasWindow, getWindow } from "../../core/utils/window";
import eventsEngine from "../../events/core/events_engine";
import eventUtils from "../../events/utils";

const DIAGRAM_CLASS = "dx-diagram";
const DIAGRAM_FULLSCREEN_CLASS = "dx-diagram-fullscreen";
const DIAGRAM_TOOLBAR_WRAPPER_CLASS = DIAGRAM_CLASS + "-toolbar-wrapper";
const DIAGRAM_CONTENT_WRAPPER_CLASS = DIAGRAM_CLASS + "-content-wrapper";
const DIAGRAM_DRAWER_WRAPPER_CLASS = DIAGRAM_CLASS + "-drawer-wrapper";
const DIAGRAM_CONTENT_CLASS = DIAGRAM_CLASS + "-content";

const DIAGRAM_DEFAULT_UNIT = "in";
const DIAGRAM_DEFAULT_PAGE_SIZE = { width: 5.827, height: 8.268 };
const DIAGRAM_DEFAULT_PAGE_ORIENTATION = "portrait";
const DIAGRAM_DEFAULT_PAGE_COLOR = "white";

const DIAGRAM_KEY_FIELD = "id";
const DIAGRAM_TEXT_FIELD = "text";
const DIAGRAM_TYPE_FIELD = "type";
const DIAGRAM_PARENT_KEY_FIELD = "parentId";
const DIAGRAM_ITEMS_FIELD = "items";
const DIAGRAM_FROM_FIELD = "from";
const DIAGRAM_TO_FIELD = "to";

const DIAGRAM_NAMESPACE = "dxDiagramEvent";
const FULLSCREEN_CHANGE_EVENT_NAME = eventUtils.addNamespace("fullscreenchange", DIAGRAM_NAMESPACE);
const IE_FULLSCREEN_CHANGE_EVENT_NAME = eventUtils.addNamespace("msfullscreenchange", DIAGRAM_NAMESPACE);
const WEBKIT_FULLSCREEN_CHANGE_EVENT_NAME = eventUtils.addNamespace("webkitfullscreenchange", DIAGRAM_NAMESPACE);
const MOZ_FULLSCREEN_CHANGE_EVENT_NAME = eventUtils.addNamespace("mozfullscreenchange", DIAGRAM_NAMESPACE);

class Diagram extends Widget {
    _init() {
        this._updateDiagramLockCount = 0;

        super._init();
        this._initDiagram();
    }
    _initMarkup() {
        super._initMarkup();
        const isServerSide = !hasWindow();
        this.$element().addClass(DIAGRAM_CLASS);

        this._toolbarInstance = undefined;
        if(this.option("toolbar.visible")) {
            this._renderToolbar();
        }

        const $contentWrapper = $("<div>")
            .addClass(DIAGRAM_CONTENT_WRAPPER_CLASS)
            .appendTo(this.$element());

        this._leftPanel = undefined;
        if(this.option("toolbox.visible")) {
            this._renderLeftPanel($contentWrapper);
        }

        const $drawerWrapper = $("<div>")
            .addClass(DIAGRAM_DRAWER_WRAPPER_CLASS)
            .appendTo($contentWrapper);

        const $drawer = $("<div>")
            .appendTo($drawerWrapper);

        const $content = $("<div>")
            .addClass(DIAGRAM_CONTENT_CLASS)
            .appendTo($drawer);

        this._rightPanel = undefined;
        if(this.option("propertiesPanel.visible")) {
            this._renderRightPanel($drawer);
        }

        this._contextMenu = undefined;
        if(this.option("contextMenu.enabled")) {
            this._renderContextMenu($content);
        }

        !isServerSide && this._diagramInstance.createDocument($content[0]);

        if(this.option("fullscreen")) {
            this._updateFullscreenState();
        }
    }
    _renderToolbar() {
        const $toolbarWrapper = $("<div>")
            .addClass(DIAGRAM_TOOLBAR_WRAPPER_CLASS)
            .appendTo(this.$element());
        var toolbarWidgetCommandNames = [];
        if(this.option("propertiesPanel.visible") && this.option("propertiesPanel.collapsible")) {
            toolbarWidgetCommandNames.push("options");
        }
        this._toolbarInstance = this._createComponent($toolbarWrapper, DiagramToolbar, {
            commands: this.option("toolbar.commands"),
            onContentReady: (e) => this._diagramInstance.barManager.registerBar(e.component.bar),
            onPointerUp: this._onPanelPointerUp.bind(this),
            export: this.option("export"),
            widgetCommandNames: toolbarWidgetCommandNames
        });
    }
    _renderLeftPanel($parent) {
        const isServerSide = !hasWindow();

        const $leftPanel = $("<div>")
            .appendTo($parent);

        this._leftPanel = this._createComponent($leftPanel, DiagramLeftPanel, {
            toolboxGroups: this._getToolboxGroups(),
            disabled: this.option("readOnly"),
            onShapeCategoryRendered: (e) => {
                if(isServerSide) return;

                var $toolboxContainer = $(e.$element);
                this._diagramInstance.createToolbox($toolboxContainer[0], 40, 8,
                    { 'data-toggle': 'shape-toolbox-tooltip' },
                    e.shapes || e.category, e.style === "texts");
                this._createTooltips($parent, $toolboxContainer.find('[data-toggle="shape-toolbox-tooltip"]'));
            },
            onPointerUp: this._onPanelPointerUp.bind(this)
        });
    }
    _createTooltips($container, targets) {
        targets.each((index, element) => {
            var $target = $(element);
            const $tooltip = $("<div>")
                .html($target.attr("title"))
                .appendTo($container);
            this._tooltipInstance = this._createComponent($tooltip, Tooltip, {
                target: $target,
                showEvent: "mouseenter",
                hideEvent: "mouseleave",
                position: "top",
                animation: {
                    show: { type: "fade", from: 0, to: 1, delay: 500 },
                    hide: { type: "fade", from: 1, to: 0, delay: 100 }
                }
            });
        });

    }
    _invalidateContextMenuCommands() {
        if(this._contextMenu) {
            this._contextMenu.option({
                commands: this.option("contextMenu.commands")
            });
        }
    }
    _invalidatePropertiesPanelGroups() {
        if(this._rightPanel) {
            this._rightPanel.option({
                propertyGroups: this.option("propertiesPanel.groups")
            });
        }
    }
    _invalidateToolbarCommands() {
        if(this._toolbarInstance) {
            this._toolbarInstance.option({
                commands: this.option("toolbar.commands")
            });
        }
    }
    _invalidateToolboxGroups() {
        if(this._leftPanel) {
            this._leftPanel.option({
                toolboxGroups: this._getToolboxGroups()
            });
        }
    }
    _setLeftPanelEnabled(enabled) {
        if(this._leftPanel) {
            this._leftPanel.option({
                disabled: !enabled
            });
        }
    }

    _renderRightPanel($parent) {
        const isCollapsible = this.option("propertiesPanel.collapsible");
        var drawer = this._createComponent($parent, Drawer, {
            closeOnOutsideClick: isCollapsible,
            opened: !isCollapsible,
            openedStateMode: isCollapsible ? "overlap" : "shrink",
            position: "right",
            template: ($options) => {
                this._rightPanel = this._createComponent($options, DiagramRightPanel, {
                    propertyGroups: this.option("propertiesPanel.groups"),
                    onContentReady: (e) => this._diagramInstance.barManager.registerBar(e.component.bar),
                    onPointerUp: this._onPanelPointerUp.bind(this)
                });
            }
        });

        if(this._toolbarInstance) {
            this._toolbarInstance.option("onWidgetCommand", (e) => {
                if(e.name === "options") {
                    drawer.toggle();
                }
            });
        }
    }

    _onPanelPointerUp() {
        this._diagramInstance.captureFocus();
    }

    _renderContextMenu($mainElement) {
        const $contextMenu = $("<div>")
            .appendTo(this.$element());
        this._contextMenu = this._createComponent($contextMenu, DiagramContextMenu, {
            commands: this.option("contextMenu.commands"),
            container: $mainElement,
            onContentReady: ({ component }) => this._diagramInstance.barManager.registerBar(component.bar),
            onVisibleChanged: ({ component }) => this._diagramInstance.barManager.updateBarItemsState(component.bar)
        });
    }

    _initDiagram() {
        const { DiagramControl } = getDiagram();
        this._diagramInstance = new DiagramControl();
        this._diagramInstance.onChanged = this._raiseDataChangeAction.bind(this);
        this._diagramInstance.onEdgeInserted = this._raiseEdgeInsertedAction.bind(this);
        this._diagramInstance.onEdgeUpdated = this._raiseEdgeUpdatedAction.bind(this);
        this._diagramInstance.onEdgeRemoved = this._raiseEdgeRemovedAction.bind(this);
        this._diagramInstance.onNodeInserted = this._raiseNodeInsertedAction.bind(this);
        this._diagramInstance.onNodeUpdated = this._raiseNodeUpdatedAction.bind(this);
        this._diagramInstance.onNodeRemoved = this._raiseNodeRemovedAction.bind(this);
        this._diagramInstance.onToolboxDragStart = this._raiseToolboxDragStart.bind(this);
        this._diagramInstance.onToolboxDragEnd = this._raiseToolboxDragEnd.bind(this);
        this._diagramInstance.onToggleFullscreen = this._onToggleFullscreen.bind(this);

        if(this.option("document.units") !== DIAGRAM_DEFAULT_UNIT) {
            this._updateDocumentUnitsState();
        }
        if(this.option("document.pageSize") &&
            (this.option("document.pageSize").width !== DIAGRAM_DEFAULT_PAGE_SIZE.width ||
            this.option("document.pageSize").height !== DIAGRAM_DEFAULT_PAGE_SIZE.height)) {
            this._updateDocumentPageSizeState();
        }
        if(this.option("document.pageOrientation") !== DIAGRAM_DEFAULT_PAGE_ORIENTATION) {
            this._updateDocumentPageOrientationState();
        }
        if(this.option("document.pageColor") !== DIAGRAM_DEFAULT_PAGE_COLOR) {
            this._updateDocumentPageColorState();
        }

        this._updateViewUnitsState();
        this._updateShowGridState();
        this._updateSnapToGridState();
        this._updateGridSizeState();
        this._updateReadOnlyState();
        this._updateZoomLevelState();
        this._updateAutoZoomState();
        this._updateSimpleViewState();

        this._updateCustomShapes(this._getCustomShapes());
        this._refreshDataSources();
    }
    _executeDiagramCommand(command, parameter) {
        this._diagramInstance.commandManager.getCommand(command).execute(parameter);
    }
    _refreshDataSources() {
        this._beginUpdateDiagram();
        this._refreshNodesDataSource();
        this._refreshEdgesDataSource();
        this._endUpdateDiagram();
    }
    _refreshNodesDataSource() {
        if(this._nodesOption) {
            this._nodesOption._disposeDataSource();
            delete this._nodesOption;
            delete this._nodes;
        }
        if(this.option("nodes.dataSource")) {
            this._nodesOption = new NodesOption(this);
            this._nodesOption.option("dataSource", this.option("nodes.dataSource"));
            this._nodesOption._refreshDataSource();
        }
    }
    _refreshEdgesDataSource() {
        if(this._edgesOption) {
            this._edgesOption._disposeDataSource();
            delete this._edgesOption;
            delete this._edges;
        }
        if(this.option("edges.dataSource")) {
            this._edgesOption = new EdgesOptions(this);
            this._edgesOption.option("dataSource", this.option("edges.dataSource"));
            this._edgesOption._refreshDataSource();
        }
    }
    _getDiagramData() {
        let value;
        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.Export, function(data) { value = data; });
        return value;
    }
    _setDiagramData(data, keepExistingItems) {
        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.Import, { data, keepExistingItems });
    }

    _nodesDataSourceChanged(nodes) {
        this._nodes = nodes;
        this._bindDiagramData();
    }
    _edgesDataSourceChanged(edges) {
        this._edges = edges;
        this._bindDiagramData();
    }
    _createGetter(expr) {
        return dataCoreUtils.compileGetter(expr);
    }
    _createSetter(expr) {
        if(typeUtils.isFunction(expr)) {
            return expr;
        }
        return dataCoreUtils.compileSetter(expr);
    }
    _createOptionGetter(optionName) {
        var expr = this.option(optionName);
        return this._createGetter(expr);
    }
    _createOptionSetter(optionName) {
        var expr = this.option(optionName);
        return this._createSetter(expr);
    }
    _bindDiagramData() {
        if(this._updateDiagramLockCount || !this._isBindingMode()) return;

        const { DiagramCommand } = getDiagram();
        const data = {
            nodeDataSource: this._nodes,
            edgeDataSource: this._edges,
            nodeDataImporter: {
                getKey: this._createOptionGetter("nodes.keyExpr"),
                setKey: this._createOptionSetter("nodes.keyExpr"),
                getText: this._createOptionGetter("nodes.textExpr"),
                setText: this._createOptionSetter("nodes.textExpr"),
                getType: this._createOptionGetter("nodes.typeExpr"),
                setType: this._createOptionSetter("nodes.typeExpr"),

                getParentKey: this._createOptionGetter("nodes.parentKeyExpr"),
                setParentKey: this._createOptionSetter("nodes.parentKeyExpr"),
                getItems: this._createOptionGetter("nodes.itemsExpr"),
                setItems: this._createOptionSetter("nodes.itemsExpr")
            },
            edgeDataImporter: {
                getKey: this._createOptionGetter("edges.keyExpr"),
                setKey: this._createOptionSetter("edges.keyExpr"),
                getFrom: this._createOptionGetter("edges.fromExpr"),
                setFrom: this._createOptionSetter("edges.fromExpr"),
                getTo: this._createOptionGetter("edges.toExpr"),
                setTo: this._createOptionSetter("edges.toExpr")
            },
            layoutType: this._getDataBindingLayoutType()
        };
        this._executeDiagramCommand(DiagramCommand.BindDocument, data);
    }
    _getDataBindingLayoutType() {
        const { DataLayoutType } = getDiagram();
        switch(this.option("layout")) {
            case "sugiyama":
                return DataLayoutType.Sugiyama;
            default:
                return DataLayoutType.Tree;
        }
    }
    _getAutoZoomValue(option) {
        const { AutoZoomMode } = getDiagram();
        switch(option) {
            case "fitContent":
                return AutoZoomMode.FitContent;
            case "fitWidth":
                return AutoZoomMode.FitToWidth;
            default:
                return AutoZoomMode.Disabled;
        }
    }
    _isBindingMode() {
        return this._nodes || this._edges;
    }
    _beginUpdateDiagram() {
        this._updateDiagramLockCount++;
    }
    _endUpdateDiagram() {
        this._updateDiagramLockCount = Math.max(this._updateDiagramLockCount - 1, 0);
        if(!this._updateDiagramLockCount) {
            this._bindDiagramData();
        }
    }

    _getCustomShapes() {
        return this.option("customShapes") || [];
    }
    _getToolboxGroups() {
        return DiagramToolbox.getGroups(this.option("toolbox.groups"));
    }
    _updateCustomShapes(customShapes, prevCustomShapes) {
        if(Array.isArray(prevCustomShapes)) {
            this._diagramInstance.removeCustomShapes(customShapes.map(
                function(s) {
                    return s.type;
                }
            ));
        }

        if(Array.isArray(customShapes)) {
            this._diagramInstance.addCustomShapes(customShapes.map(
                function(s) {
                    return {
                        category: s.category,
                        type: s.type,
                        baseType: s.baseType,
                        title: s.title,
                        svgUrl: s.backgroundImageUrl,
                        svgLeft: s.backgroundImageLeft,
                        svgTop: s.backgroundImageTop,
                        svgWidth: s.backgroundImageWidth,
                        svgHeight: s.backgroundImageHeight,
                        defaultWidth: s.defaultWidth,
                        defaultHeight: s.defaultHeight,
                        defaultText: s.defaultText,
                        allowEditText: s.allowEditText,
                        textLeft: s.textLeft,
                        textTop: s.textTop,
                        textWidth: s.textWidth,
                        textHeight: s.textHeight,
                        defaultImageUrl: s.defaultImageUrl,
                        allowEditImage: s.allowEditImage,
                        imageLeft: s.imageLeft,
                        imageTop: s.imageTop,
                        imageWidth: s.imageWidth,
                        imageHeight: s.imageHeight,
                        connectionPoints: s.connectionPoints && s.connectionPoints.map(pt => {
                            return { 'x': pt.x, 'y': pt.y };
                        })
                    };
                }
            ));
        }
    }
    _onToggleFullscreen(fullscreen) {
        this._changeNativeFullscreen(fullscreen);
        this.$element().toggleClass(DIAGRAM_FULLSCREEN_CLASS, fullscreen);
        this._diagramInstance.updateLayout();
    }
    _changeNativeFullscreen(setModeOn) {
        let window = getWindow();
        if(window.self === window.top || setModeOn === this._inNativeFullscreen()) return;

        if(setModeOn) {
            this._subscribeFullscreenNativeChanged();
        } else {
            this._unsubscribeFullscreenNativeChanged();
        }
        this._setNativeFullscreen(setModeOn);
    }
    _setNativeFullscreen(on) {
        let window = getWindow(),
            document = window.self.document,
            body = window.self.document.body;
        if(on) {
            if(body.requestFullscreen) {
                body.requestFullscreen();
            } else if(body.mozRequestFullscreen) {
                body.mozRequestFullscreen();
            } else if(body.webkitRequestFullscreen) {
                body.webkitRequestFullscreen();
            } else if(body.msRequestFullscreen) {
                body.msRequestFullscreen();
            }
        } else {
            if(document.exitFullscreen) {
                document.exitFullscreen();
            } else if(document.mozCancelFullscreen) {
                document.mozCancelFullscreen();
            } else if(document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if(document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }
    _inNativeFullscreen() {
        let document = getWindow().document,
            fullscreenElement = document.fullscreenElement || document.msFullscreenElement || document.webkitFullscreenElement,
            isInFullscreen = fullscreenElement === document.body || document.webkitIsFullscreen;
        return !!isInFullscreen;
    }
    _subscribeFullscreenNativeChanged() {
        let document = getWindow().document,
            handler = this._onNativeFullscreenChangeHandler.bind(this);
        eventsEngine.on(document, FULLSCREEN_CHANGE_EVENT_NAME, handler);
        eventsEngine.on(document, IE_FULLSCREEN_CHANGE_EVENT_NAME, handler);
        eventsEngine.on(document, WEBKIT_FULLSCREEN_CHANGE_EVENT_NAME, handler);
        eventsEngine.on(document, MOZ_FULLSCREEN_CHANGE_EVENT_NAME, handler);
    }
    _unsubscribeFullscreenNativeChanged() {
        let document = getWindow().document;
        eventsEngine.off(document, FULLSCREEN_CHANGE_EVENT_NAME);
        eventsEngine.off(document, IE_FULLSCREEN_CHANGE_EVENT_NAME);
        eventsEngine.off(document, WEBKIT_FULLSCREEN_CHANGE_EVENT_NAME);
        eventsEngine.off(document, MOZ_FULLSCREEN_CHANGE_EVENT_NAME);
    }
    _onNativeFullscreenChangeHandler() {
        if(!this._inNativeFullscreen()) {
            this._unsubscribeFullscreenNativeChanged();
            this._setFullscreen(false);
        }
    }

    _getDiagramUnitValue(value) {
        const { DiagramUnit } = getDiagram();
        switch(value) {
            case "in":
                return DiagramUnit.In;
            case "cm":
                return DiagramUnit.Cm;
            case "px":
                return DiagramUnit.Px;
            default:
                return DiagramUnit.In;
        }
    }
    _updateReadOnlyState() {
        const { DiagramCommand } = getDiagram();
        var readOnly = this.option("readOnly");
        this._executeDiagramCommand(DiagramCommand.ToggleReadOnly, readOnly);
        this._setLeftPanelEnabled(!readOnly);
    }
    _updateZoomLevelState() {
        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.ZoomLevel, this.option("zoomLevel"));
    }
    _updateAutoZoomState() {
        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.SwitchAutoZoom, this._getAutoZoomValue(this.option("autoZoom")));
    }
    _updateSimpleViewState() {
        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.ToggleSimpleView, this.option("simpleView"));
    }
    _updateFullscreenState() {
        const { DiagramCommand } = getDiagram();
        var fullscreen = this.option("fullscreen");
        this._executeDiagramCommand(DiagramCommand.Fullscreen, fullscreen);
        this._onToggleFullscreen(fullscreen);
    }
    _updateShowGridState() {
        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.ShowGrid, this.option("showGrid"));
    }
    _updateSnapToGridState() {
        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.SnapToGrid, this.option("snapToGrid"));
    }
    _updateGridSizeState() {
        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.GridSize, this.option("gridSize"));
    }
    _updateViewUnitsState() {
        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.ViewUnits, this._getDiagramUnitValue(this.option("viewUnits")));
    }

    _updateDocumentUnitsState() {
        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.Units, this._getDiagramUnitValue(this.option("document.units")));
    }
    _updateDocumentPageSizeState() {
        var size = this.option("document.pageSize");
        if(!size || !size.width || !size.height) return;

        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.PageSize, size);
    }
    _updateDocumentPageOrientationState() {
        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.PageLandscape, this.option("document.pageOrientation") === "landscape");
    }
    _updateDocumentPageColorState() {
        const { DiagramCommand } = getDiagram();
        this._executeDiagramCommand(DiagramCommand.PageColor, this.option("document.pageColor"));
    }


    /**
    * @name dxDiagramMethods.getData
    * @publicName getData()
    * @return string
    */
    getData() {
        return this._getDiagramData();
    }
    /**
    * @name dxDiagramMethods.setData
    * @publicName setData(data, updateExistingItemsOnly)
    * @param1 data:string
    * @param2 updateExistingItemsOnly:boolean
    */
    setData(data, updateExistingItemsOnly) {
        this._setDiagramData(data, updateExistingItemsOnly);
        this._raiseDataChangeAction();
    }

    _getDefaultOptions() {
        return extend(super._getDefaultOptions(), {
            /**
            * @name dxDiagramOptions.readOnly
            * @type boolean
            * @default false
            */
            readOnly: false,
            /**
            * @name dxDiagramOptions.zoomLevel
            * @type Number
            * @default 1
            */
            zoomLevel: 1,
            /**
            * @name dxDiagramOptions.simpleView
            * @type Boolean
            * @default false
            */
            simpleView: false,
            /**
            * @name dxDiagramOptions.autoZoom
            * @type Enums.DiagramAutoZoom
            * @default false
            */
            autoZoom: false,
            /**
            * @name dxDiagramOptions.fullscreen
            * @type Boolean
            * @default false
            */
            fullscreen: false,
            /**
            * @name dxDiagramOptions.showGrid
            * @type Boolean
            * @default true
            */
            showGrid: true,
            /**
            * @name dxDiagramOptions.snapToGrid
            * @type Boolean
            * @default true
            */
            snapToGrid: true,
            /**
            * @name dxDiagramOptions.gridSize
            * @type Number
            * @default 0.125
            */
            gridSize: 0.125,
            /**
            * @name dxDiagramOptions.viewUnits
            * @type Enums.DiagramUnits
            * @default "in"
            */
            viewUnits: DIAGRAM_DEFAULT_UNIT,

            /**
            * @name dxDiagramOptions.document
            * @type Object
            * @default null
            */
            document: {
                /**
                * @name dxDiagramOptions.document.units
                * @type Enums.DiagramUnits
                * @default "in"
                */
                units: DIAGRAM_DEFAULT_UNIT,
                /**
                * @name dxDiagramOptions.document.pageSize
                * @type Object
                */
                /**
                * @name dxDiagramOptions.document.pageSize.width
                * @type Number
                * @default 5.827
                */
                /**
                * @name dxDiagramOptions.document.pageSize.height
                * @type Object
                * @default 8.268
                */
                pageSize: { width: DIAGRAM_DEFAULT_PAGE_SIZE.width, height: DIAGRAM_DEFAULT_PAGE_SIZE.height },
                /**
                * @name dxDiagramOptions.document.pageOrientation
                * @type Enums.DiagramPageOrientation
                * @default "portrait"
                */
                pageOrientation: DIAGRAM_DEFAULT_PAGE_ORIENTATION,
                /**
                * @name dxDiagramOptions.document.pageColor
                * @type String
                * @default "white"
                */
                pageColor: DIAGRAM_DEFAULT_PAGE_COLOR
            },

            /**
            * @name dxDiagramOptions.onDataChanged
            * @extends Action
            * @type function(e)
            * @type_function_param1 e:object
            * @type_function_param1_field4 data:string
            * @action
            */
            onDataChanged: null,
            /**
            * @name dxDiagramOptions.nodes
            * @type Object
            * @default null
            */
            nodes: {
                /**
                * @name dxDiagramOptions.nodes.dataSource
                * @type Array<Object>|DataSource|DataSourceOptions
                * @default null
                */
                dataSource: null,
                /**
                * @name dxDiagramOptions.nodes.keyExpr
                * @type string|function(data)
                * @type_function_param1 data:object
                * @default "id"
                */
                keyExpr: DIAGRAM_KEY_FIELD,
                /**
                * @name dxDiagramOptions.nodes.textExpr
                * @type string|function(data)
                * @type_function_param1 data:object
                * @default "text"
                */
                textExpr: DIAGRAM_TEXT_FIELD,
                /**
                * @name dxDiagramOptions.nodes.typeExpr
                * @type string|function(data)
                * @type_function_param1 data:object
                * @default "type"
                */
                typeExpr: DIAGRAM_TYPE_FIELD,
                /**
                * @name dxDiagramOptions.nodes.parentKeyExpr
                * @type string|function(data)
                * @type_function_param1 data:object
                * @default "parentId"
                */
                parentKeyExpr: DIAGRAM_PARENT_KEY_FIELD,
                /**
                * @name dxDiagramOptions.nodes.itemsExpr
                * @type string|function(data)
                * @type_function_param1 data:object
                * @default "items"
                */
                itemsExpr: DIAGRAM_ITEMS_FIELD
            },
            /**
            * @name dxDiagramOptions.edges
            * @type Object
            * @default null
            */
            edges: {
                /**
                * @name dxDiagramOptions.edges.dataSource
                * @type Array<Object>|DataSource|DataSourceOptions
                * @default null
                */
                dataSource: null,
                /**
                * @name dxDiagramOptions.edges.keyExpr
                * @type string|function(data)
                * @type_function_param1 data:object
                * @default "id"
                */
                keyExpr: DIAGRAM_KEY_FIELD,
                /**
                * @name dxDiagramOptions.edges.fromExpr
                * @type string|function(data)
                * @type_function_param1 data:object
                * @default "from"
                */
                fromExpr: DIAGRAM_FROM_FIELD,
                /**
                * @name dxDiagramOptions.edges.toExpr
                * @type string|function(data)
                * @type_function_param1 data:object
                * @default "to"
                */
                toExpr: DIAGRAM_TO_FIELD
            },
            /**
             * @name dxDiagramOptions.layout
             * @type Enums.DiagramAutoLayout
             * @default "tree"
             */
            layout: "tree",

            /**
            * @name dxDiagramOptions.customShapes
            * @type Array<Object>
            * @default []
            */
            customShapes: [
                /**
                * @name dxDiagramOptions.customShapes.category
                * @type String
                */
                /**
                * @name dxDiagramOptions.customShapes.type
                * @type String
                */
                /**
                * @name dxDiagramOptions.customShapes.baseType
                * @type Enums.DiagramShapeType|String
                */
                /**
                * @name dxDiagramOptions.customShapes.title
                * @type String
                */
                /**
                * @name dxDiagramOptions.customShapes.backgroundImageUrl
                * @type String
                */
                /**
                * @name dxDiagramOptions.customShapes.backgroundImageLeft
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.backgroundImageTop
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.backgroundImageWidth
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.backgroundImageHeight
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.defaultWidth
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.defaultHeight
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.defaultText
                * @type String
                */
                /**
                * @name dxDiagramOptions.customShapes.allowEditText
                * @type Boolean
                */
                /**
                * @name dxDiagramOptions.customShapes.textLeft
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.textTop
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.textWidth
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.textHeight
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.defaultImageUrl
                * @type String
                */
                /**
                * @name dxDiagramOptions.customShapes.allowEditImage
                * @type Boolean
                */
                /**
                * @name dxDiagramOptions.customShapes.imageLeft
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.imageTop
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.imageWidth
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.imageHeight
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.connectionPoints
                * @type Array<Object>
                */
                /**
                * @name dxDiagramOptions.customShapes.connectionPoints.x
                * @type Number
                */
                /**
                * @name dxDiagramOptions.customShapes.connectionPoints.y
                * @type Number
                */
            ],
            /**
            * @name dxDiagramOptions.toolbox
            * @type Object
            * @default {}
            */
            toolbox: {
                /**
                * @name dxDiagramOptions.toolbox.visible
                * @type boolean
                * @default true
                */
                visible: true,
                /**
                * @name dxDiagramOptions.toolbox.groups
                * @type Array<Object>|Array<Enums.DiagramShapeCategory>
                * @default undefined
                */
                /**
                * @name dxDiagramOptions.toolbox.groups.category
                * @type Enums.DiagramShapeCategory|String
                */
                /**
                * @name dxDiagramOptions.toolbox.groups.title
                * @type String
                */
                /**
                * @name dxDiagramOptions.toolbox.groups.style
                * @type Enums.DiagramToolboxStyle
                */
                /**
                * @name dxDiagramOptions.toolbox.groups.expanded
                * @type Boolean
                */
                /**
                * @name dxDiagramOptions.toolbox.groups.shapes
                * @type Array<Enums.DiagramShapeType>|Array<String>
                */
            },
            /**
            * @name dxDiagramOptions.toolbar
            * @type Object
            * @default {}
            */
            toolbar: {
                /**
                * @name dxDiagramOptions.toolbar.visible
                * @type boolean
                * @default true
                */
                visible: true,
                /**
                * @name dxDiagramOptions.toolbar.commands
                * @type Array<Enums.DiagramToolbarCommand>
                * @default undefined
                */
            },
            /**
            * @name dxDiagramOptions.contextMenu
            * @type Object
            * @default {}
            */
            contextMenu: {
                /**
                * @name dxDiagramOptions.contextMenu.enabled
                * @type boolean
                * @default true
                */
                enabled: true,
                /**
                * @name dxDiagramOptions.contextMenu.commands
                * @type Array<Enums.DiagramContextMenuCommand>
                * @default undefined
                */
            },
            /**
            * @name dxDiagramOptions.propertiesPanel
            * @type Object
            * @default {}
            */
            propertiesPanel: {
                /**
                * @name dxDiagramOptions.propertiesPanel.visible
                * @type Boolean
                * @default true
                */
                visible: true,
                /**
                * @name dxDiagramOptions.propertiesPanel.collapsible
                * @type Boolean
                * @default true
                */
                collapsible: true,
                /**
                * @name dxDiagramOptions.propertiesPanel.groups
                * @type Array<Object>
                * @default undefined
                */
                /**
                * @name dxDiagramOptions.propertiesPanel.groups.commands
                * @type Array<Enums.DiagramPropertiesPanelCommand>
                */
            },

            /**
             * @name dxDiagramOptions.export
             * @type object
             */
            export: {
                /**
                 * @name dxDiagramOptions.export.fileName
                 * @type string
                 * @default "Diagram"
                 */
                fileName: "Diagram",
                /**
                 * @name dxDiagramOptions.export.proxyUrl
                 * @type string
                 * @default undefined
                 */
                proxyUrl: undefined
            }
        });
    }

    _createDataChangeAction() {
        this._dataChangeAction = this._createActionByOption("onDataChanged");
    }
    _raiseDataChangeAction() {
        if(!this.option("onDataChanged")) return;

        if(!this._dataChangeAction) {
            this._createDataChangeAction();
        }
        this._dataChangeAction({
            data: this.getData()
        });
    }
    _raiseEdgeInsertedAction(data, callback) {
        if(this._edgesOption) {
            this._edgesOption.insert(data, callback);
        }
    }
    _raiseEdgeUpdatedAction(key, data, callback) {
        if(this._edgesOption) {
            this._edgesOption.update(key, data, callback);
        }
    }
    _raiseEdgeRemovedAction(key, callback) {
        if(this._edgesOption) {
            this._edgesOption.remove(key, callback);
        }
    }
    _raiseNodeInsertedAction(data, callback) {
        if(this._nodesOption) {
            this._nodesOption.insert(data, callback);
        }
    }
    _raiseNodeUpdatedAction(key, data, callback) {
        if(this._nodesOption) {
            this._nodesOption.update(key, data, callback);
        }
    }
    _raiseNodeRemovedAction(key, callback) {
        if(this._nodesOption) {
            this._nodesOption.remove(key, callback);
        }
    }
    _raiseToolboxDragStart() {
        if(this._leftPanel) {
            this._leftPanel.$element().addClass("dx-skip-gesture-event");
        }
    }
    _raiseToolboxDragEnd() {
        if(this._leftPanel) {
            this._leftPanel.$element().removeClass("dx-skip-gesture-event");
        }
    }

    _optionChanged(args) {
        switch(args.name) {
            case "readOnly":
                this._updateReadOnlyState();
                break;
            case "zoomLevel":
                this._updateZoomLevelState();
                break;
            case "autoZoom":
                this._updateAutoZoomState();
                break;
            case "simpleView":
                this._updateSimpleViewState();
                break;
            case "fullscreen":
                this._updateFullscreenState();
                break;
            case "showGrid":
                this._updateShowGridState();
                break;
            case "snapToGrid":
                this._updateSnapToGridState();
                break;
            case "gridSize":
                this._updateGridSizeState();
                break;
            case "viewUnits":
                this._updateViewUnitsState();
                break;
            case "document.units":
                this._updateDocumentUnitsState();
                break;
            case "document.pageSize":
                this._updateDocumentPageSizeState();
                break;
            case "document.pageOrientation":
                this._updateDocumentPageOrientationState();
                break;
            case "document.pageColor":
                this._updateDocumentPageColorState();
                break;
            case "document":
                this._updateDocumentUnitsState();
                this._updateDocumentPageSizeState();
                this._updateDocumentPageOrientationState();
                this._updateDocumentPageColorState();
                break;
            case "nodes":
                this._refreshNodesDataSource();
                break;
            case "edges":
                this._refreshEdgesDataSource();
                break;
            case "layout":
                this._refreshDataSources();
                break;
            case "customShapes":
                this._updateCustomShapes(args.value, args.previousValue);
                this._invalidate();
                break;
            case "contextMenu.commands":
                this._invalidateContextMenuCommands();
                break;
            case "propertiesPanel.groups":
                this._invalidatePropertiesPanelGroups();
                break;
            case "toolbar.commands":
                this._invalidateToolbarCommands();
                break;
            case "toolbox.groups":
                this._invalidateToolboxGroups();
                break;
            case "contextMenu":
            case "propertiesPanel":
            case "toolbox":
            case "toolbar":
                this._invalidate();
                break;
            case "onDataChanged":
                this._createDataChangeAction();
                break;
            case "export":
                this._toolbarInstance.option("export", this.option("export"));
                break;
            default:
                super._optionChanged(args);
        }
    }
}

registerComponent("dxDiagram", Diagram);
module.exports = Diagram;