FBL.ns(function() { with (FBL) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const jsdICallHook = Ci.jsdICallHook;

// Register string bundle for $STR method
Firebug.registerStringBundle("chrome://fireflow/locale/fireflow.properties");

function getPrefs() {
    return CCSV('@mozilla.org/preferences-service;1', 'nsIPrefBranch');
}

// ********************************************************************************************* //
// FFlowPanel

function FFlowPanel() {}
FFlowPanel.prototype = extend(Firebug.Panel,
{
    name: "fFlow",
    title: "FireFlow",
    searchable: true,

    initialize: function(context, doc)
    {
        Firebug.Panel.initialize.apply(this, arguments);
        appendStylesheet(doc, "chrome://fireflow/skin/fireflow.css");
    },

    show: function(state)
    {
        Firebug.Panel.show.apply(this, arguments);

        this.showToolbarButtons("fbFlowButtons", true);

        this.refresh();
    },

    hide: function()
    {
        Firebug.Panel.hide.apply(this, arguments);

        this.showToolbarButtons("fbFlowButtons", false);
    },

    search: function(text, reverse)
    {
      // incremental search, get the row and highlight it, return true for match false otherwise
      if (!text)
      {
          delete this.currentSearch;
          this._highlightRow(null);
          return false;
      }

      var row;
      if (this.currentSearch && text == this.currentSearch.text) {
          row = this.currentSearch.findNext(true, undefined, reverse, Firebug.Search.isCaseSensitive(text));

      } else {
          function findRow(node) { return getAncestorByClass(node, "memberRow"); }
          this.currentSearch = new TextSearch(this.panelNode, findRow);
          row = this.currentSearch.find(text, reverse, Firebug.Search.isCaseSensitive(text))
      }
      if (row) {
          this._highlightRow(row);
          return true;
      } else {
          return false;
      }
  },

  _highlightRow: function(row)
  {
      if (this.highlightedRow)
          cancelClassTimed(this.highlightedRow, "jumpHighlight", this.context);

      this.highlightedRow = row;

      if (row)
          setClassTimed(row, "jumpHighlight", this.context);
  },

  getOptionsMenuItems: function()
  {
      return [
          {label: "Help", command: bindFixed(this._openHelpLink, this, true) }
      ];
  },

  _openHelpLink: function() 
  {
      var url ="http://blog.imaginea.com/fireflow/";
      this.openLink(url);
  },

   /**
   * Check if an integer preference is set.  If so, return its value.
   * If not, return the default value passed as an argument.
   * @param {string} prefName The name of the preference to fetch.
   * @param {number} defaultValue The default value to use if the
   *     pref is undefined or not a number.
   * @return {number} The preference value.
   */
  getIntPref: function(prefName, defaultValue)
  {
	var prefs = getPrefs();
	if (prefs.getPrefType(prefName) == prefs.PREF_INT) {
	  return prefs.getIntPref(prefName);
	} else {
	  return defaultValue;
	}
  },

  /**
   * Open the given link, respecting the user's pref to open in a tab
   * vs a new window.
   * @param {string} url The url to open.
   */
  openLink: function(url)
  {
	if (this.getIntPref('browser.link.open_newwindow', 3) == 3){
		gBrowser.selectedTab = gBrowser.addTab(url);
	} else {
	  FirebugChrome.window.open(url, '_blank');
		}
	  }

  });

// ********************************************************************************************* //
// FFlowModule

function FFlowModule() {}
Firebug.FFlowModule = extend(Firebug.Module,
/** @lends Firebug.FTraceModule */
{
     initialize: function(prefDomain, prefNames)
     {
         Firebug.Module.initialize.apply(this, arguments);

         var prefs = getPrefs();
         prefs.addObserver(Firebug.prefDomain, this, false);
         this.jsd, this.fireFlowing;
         this.started = false;
         this.customFilters = [];
     },

     shutdown: function()
     {
         Firebug.Module.shutdown.apply(this, arguments);

         var prefs = getPrefs();
         prefs.removeObserver(Firebug.prefDomain, this, false);
     },

     internationalizeUI: function(doc)
     {
         var elements = ["ftraceToggle"];
         for (var i=0; i<elements.length; i++)
         {
             var element = $(elements[i], doc);
             FBL.internationalize(element, "label");
             FBL.internationalize(element, "tooltiptext");
         }
     },

     refresh: function(context)
     {
         var panel = context.getPanel("ftrace", true);
         if (panel)
             panel.refresh();
     },

     // nsIPrefObserver
     observe: function(subject, topic, data)
     {
         if (topic != "nsPref:changed")
             return;
         // TODO someday support the default path depth as preference

     },

     clearPanel: function(context) 
     {
         var panel = context.getPanel("fFlow", true);
         FireFlowTemplate.clearMessageTag.replace({}, panel.panelNode);
     },

     toggleTrackingPath: function(context)
     {
         this.logMessage("About the toggle tracking path");
         // Error prone: so irrespective of how sure u r keep it in try catch
         try{
             if (this.jsd) {
                 if(this.fireFlowing) {
                     this.jsd.pause();
                     while (this.jsd.pauseDepth > 0) {  // unwind completely
                         this.jsd.unPause();
                     }
                     this.logMessage("Stopping the jsd debugger");
                     this.jsd.functionHook = this.originalFunctionHook;
                     //this.jsd.off();
					 this.fireFlowing = false;
                     this.showTree(context);
                     this.logMessage("Stopped the jsd debugger");
                 } else {
                     this.startDebugger(context);
                 }
             } else {
                 try{
                     this.jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"].getService(Ci.jsdIDebuggerService);
                     this.startDebugger(context);
                 } catch(e) {
                     this.logError(e);
                 }
             }
         }catch(e){
             this.logError(e);
         }
     },

     logMessage: function(message)
     {
         // At times error console is a easier place to look at logs
         if (Components) {
             var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
             if (consoleService != null) {
                 consoleService.logStringMessage(message);
             }
         }
         FBTrace.sysout(message);
     },

     logError: function(error)
     {
         this.logMessage(error);
     },

     startDebugger: function(context)
     {
         this.logMessage("Starting the async debugger");
         this.rootNode = new FlowNode("trace-root", "Trace Root");
         this.currentNode = this.rootNode;
		 this.fireFlowing = true;
         if (! (this.filtersAdded )) {
             this._addFilters(this.jsd);
             this.filtersAdded = true;
         }
         if (!(this.customFilters)) {
             this.customFilters = [];
         }
         this._addCustomFilters(this.jsd, this.customFilters);
         this._injectOnCallHook();

         var self = this;
         if (this.jsd.asyncOn) {
             this.jsd.asyncOn({
                 onDebuggerActivated: function()
                 {
                     self.logMessage("Started the async debugger");
                 }
             });
         } else {
             this.jsd.on();
         }
         this.showMessage(context);
         this.logMessage("registered the function hook");
     },

     markReturn: function(self)
     {
         if (self.currentNode && self.currentNode.parent) {
             var lastSibling = self.currentNode.lastChild();
             if (lastSibling && lastSibling.ignoreReturnCount > 0) {
                 lastSibling.ignoreReturnCount--;
             } else {
                 self.currentNode = self.currentNode.parent;
             }
         }
     },

     markEntry: function(calledFunctionName, scriptName, lineNumber, self)
     {
         if (self.currentNode) {
             var lastSibling = self.currentNode.lastChild()
             if (lastSibling && calledFunctionName == lastSibling.functionName && scriptName == lastSibling.scriptName) {
                 lastSibling.increaseInvocationCount();
                 lastSibling.ignoreReturnCount++;
             } else {
                 var childNode = new FlowNode(calledFunctionName, scriptName);
                 childNode.lineNumber = lineNumber;
                 self.currentNode.addChild(childNode);
                 self.currentNode = childNode;
             }
         }
     },

     showTree: function(context)
     {
         try{
             $("fFlowToggle").label="Start";

             var panel = context.getPanel("fFlow", true);
             if (panel) {
                 if (this.rootNode) {
                     FireFlowTemplate.tag.replace({node:this.rootNode}, panel.panelNode);
                     this._decorateTemplate(panel.panelNode);
                 } else {
                     FireFlowTemplate.noResultTag.replace({}, panel.panelNode);
                 }
             }
             this.rootNode = null;
             this.currentNode = null;
         }catch(e) {
             this.logError(e);
         }

     },

     showTreeInScriptPanel:function(context)
     {
         var panel = context.getPanel("fFlow", true);
         var scriptPanel = context.getPanel("fFlowScriptPanel", true);
         this.logMessage(panel.panelNode.innerHTML);

         try{
             if (scriptPanel) {
                 scriptPanel.panelNode.innerHTML = panel.panelNode.innerHTML;
                 this._decorateTemplate(scriptPanel.panelNode);
                 this.logMessage("Passing html content to script panel");

             } else {
                 alert("Please enable the FireFlow panel under Script tab by selecting it and then perform this action again");
             }
         }catch(e) {
             this.logError(e);
         }
     },

     showScriptsListPanel:function(context)
     {
    	 this.logMessage("About the toggle tracking path");
         // Error prone: so irrespective of how sure u r keep it in try catch
         try{
             if (this.jsd) {
                 if(this.fireFlowing) {
                     this.jsd.pause();
                     while (this.jsd.pauseDepth > 0) {  // unwind completely
                         this.jsd.unPause();
                     }
                     this.logMessage("Stopping the jsd debugger");
                     this.jsd.functionHook = this.originalFunctionHook;
                     //this.jsd.off();
					 this.fireFlowing = false;
                     this.showTree(context);
                     this.logMessage("Stopped the jsd debugger");
                 } else {
                     this.startDebugger(context);
                 }
             } else {
                 try{
                     this.jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"].getService(Ci.jsdIDebuggerService);
                     this.startDebugger(context);
                 } catch(e) {
                     this.logError(e);
                 }
             }
         }catch(e){
             this.logError(e);
         }
     },

     //show all scripts typed in the text box
     showExcludedScriptsList: function(context)
     {
    	 this.logMessage("Before applying the exclude filter");
    	 var panel = context.getPanel("fFlow", true);
    	 var memberNodes = panel.panelNode.getElementsByClassName("memberRow");
    	 this._toggleMemberNodesDisplay("exclude",memberNodes);
    	 this.logMessage("After applying the exclude filter");
     },

     //show all scripts typed in the text box
     showIncludedScriptsList: function(context)
     {
    	 this.logMessage("Before applying the include filter");
    	 var panel = context.getPanel("fFlow", true);
    	 var memberNodes = panel.panelNode.getElementsByClassName("memberRow");
    	 this._toggleMemberNodesDisplay("include",memberNodes); 
    	 this.logMessage("After applying the include filter");
     },

     /**
      * type=include -->show only the member nodes having text value
      * type=exclude -->show all the other member nodes doesn't having text value
      */
     _toggleMemberNodesDisplay:function(type,memberNodes)
     {
    	 var inputText = document.getElementById("js-filter").value;
    	 var regex = new RegExp("^"+inputText+"$");
         for(var i=1,j=memberNodes.length;i<j;i++){
        	 var memberNode = memberNodes[i];
        	 //Remove all the member nodes contain the class name "hide"
        	 if(memberNode.classList.contains("hide")){
        		 memberNode.classList.remove("hide");
        	  }
        	var scriptLink = memberNode.getElementsByClassName("scriptLink");
        	if(type == "include"){
        		//add class name to all the elements that doesn't have the script
        		if(!regex.test(scriptLink[0].innerHTML)){
        			memberNode.classList.add("hide");
            	}
        	}else{
        		//add class name to all the elements that contains the script
        		if(regex.test(scriptLink[0].innerHTML)){
            		memberNode.classList.add("hide");	
            	}
        	}
        }  
        
     },

     // AMO review does not dig onclick, so decorate this separately
     _decorateTemplate: function(panelNode)
     {
         var i = 0;
         var scriptLinks = panelNode.getElementsByClassName('scriptLink');
         if (scriptLinks) {
             // yes forEach is the way to go, but guess what that works only in 1.6
             for (; i < scriptLinks.length; i++) {
                 scriptLinks[i].addEventListener('click', this._openSource, false);
             }
         }
         var treeNodes = panelNode.getElementsByClassName('treeNode');
         this.logMessage(treeNodes);
         if (treeNodes) {
             for (i = 0; i < treeNodes.length; i++) {
                 treeNodes[i].addEventListener('click', FireFlowTemplate.toggleState, false);
             }
         }

     },

     _openSource: function(event)
     {
         var target = event.target;
         var sourceLink = new SourceLink(target.scriptName, target.lineNumber, "js");
         Firebug.chrome.select(sourceLink);
     },

     showMessage: function(context)
     {
         $("fFlowToggle").label=$STR("fireTrace.stopLabel");
         // AN ToolTipText not working
         $("fFlowToggle").tooltiptext=$STR("fireTrace.stopToolTip");

         var panel = context.getPanel("fFlow", true);
         if (panel) {
             FireFlowTemplate.simpleMessageTag.replace({}, panel.panelNode);
         }
     },

     _createDummyPath: function()
     {
         // for quick ui testing can use this dummy tree
         this.rootNode = null;
         this.currentNode = null;
         this.markEntry("foo",1, this);
         this.markEntry("bar",2, this);
         this.markReturn(this);
         this.markEntry("foobar",3, this);
         this.markReturn(this);
         this.markReturn(this);
     },

     _injectOnCallHook: function()
     {
         this.originalFunctionHook = this.jsd.functionHook;
         var self = this;
         
         var loggingHook = {
             onCall: function(frame, type) {
                 try{
                     if (frame && frame.functionName && frame.script) {
                         var calledFunctionName = frame.functionName  ;    
                         var scriptName = frame.script.fileName;
                         if ((calledFunctionName && calledFunctionName === 'anonymous')) {
                             return;
                         }

                         if (calledFunctionName[0] != '$' && !frame.isDebugger) {
                             switch(type)  { 
                             case jsdICallHook.TYPE_TOPLEVEL_END: 
                                 
                                 self.markReturn(self);
                                 break;
                             case jsdICallHook.TYPE_TOPLEVEL_START:  
                                 
                                 self.markEntry(calledFunctionName,scriptName, frame.line, self);  
                                 break;  

                             case jsdICallHook.TYPE_FUNCTION_RETURN: 
                                 self.markReturn(self);
                                 break;
                             case jsdICallHook.TYPE_FUNCTION_CALL:  
                                 self.markEntry(calledFunctionName,scriptName, frame.line, self);  
                                 break;  
                                 
                             }   
                         }
                     }

                 }catch(e) {
                     self.logMessage(e);
                 }
             }
         };
          this.jsd.functionHook = loggingHook;
          this.jsd.topLevelHook = loggingHook;
     },

     _addFilters: function(jsd)
     {
         // AN: If we ever wanna support chromebug, this needs to change
         jsd.appendFilter(this._createFilter("*/firefox/components/*"));
         jsd.appendFilter(this._createFilter("*/firefox/modules/*"));
         jsd.appendFilter(this._createFilter("XStringBundle"));
         jsd.appendFilter(this._createFilter("chrome://*"));
         jsd.appendFilter(this._createFilter("x-jsd:ppbuffer*"));
         jsd.appendFilter(this._createFilter("XPCSafeJSObjectWrapper.cpp"));
         jsd.appendFilter(this._createFilter("resource://*"));
     },

     _addCustomFilters:function(jsd, customFilters)
     {
         var customFilterCriteria = this._createFilter("*min.js");
         customFilters.push(new FilterWrapper(customFilterCriteria));
         jsd.appendFilter(customFilterCriteria);
     },

     _createFilter: function(pattern, pass, startLine, endLine)
     {
         var jsdIFilter = Ci.jsdIFilter;
         var filter = {
             globalObject: null,
             flags: pass ? (jsdIFilter.FLAG_ENABLED | jsdIFilter.FLAG_PASS) : jsdIFilter.FLAG_ENABLED,
             urlPattern: pattern,
             startLine: 0,
             endLine: 0
         };
         return filter;
     }
});

// ********************************************************************************************* //
// FireFlowTemplate

// Template used for actual flow data, shows a div with more inner divs
var FireFlowTemplate = domplate(
{
    simpleMessageTag:
    SPAN({"class":"message"},"Press Stop to see flow"),

    clearMessageTag:
    SPAN({"class":"message"},""),

    noResultTag:
    SPAN({"class":"message"},"No Results to show"),

    tag:
    TAG("$graphNode", {node:"$node"}),

    graphNode:
    TABLE({"class": "flowInfoTable", cellpadding: 0, cellspacing: 0},
          TBODY({"class": "flowInfoTBody"},
                TR(
                    TD(
                        TAG("$graphElement", {node:"$node"})
                    )
                )
               )
         ),

    graphElement:
    DIV({"class": "nodeBox memberLabel memberRow opened", $hasChildren:"$node.childIndicator"},
        SPAN({"class":"memberLabelCell"},
             SPAN({"class":"nodeBox memberLabel treeNode"},
                  SPAN({"class":"functionName "}, "$node.functionName()   ")
                 )
            ),
        A({"class":"scriptName scriptLink", _scriptName:"$node.scriptName", _lineNumber:"$node.lineNumber"},"$node.prettyName"), 
        SPAN({"class":"lineNumber"},"(line $node.lineNumber)"),
        SPAN({"class":"scriptCount nodeBox"},"$node.invocationMessage"),
        DIV({"class":"childList"},
            FOR("child", "$node.children",
                TAG("$graphElement", {node:"$child"})
               )
                )
       ),

    toggleState: function(event) {
        var eventTarget = event.target;
        var row = null;
        if (hasClass(eventTarget, "messageNameLabel")) {
            row = getAncestorByClass(getAncestorByClass(getAncestorByClass(eventTarget,"memberLabel"), "memberLabelCell"),"memberRow" );
        } else {
            row = getAncestorByClass(getAncestorByClass(eventTarget, "memberLabelCell"),"memberRow" );
        }
        //toggle state
        if (row) {
            if (hasClass(row, "opened")) {
                removeClass(row, "opened");
                row.lastChild.style.display = "none";
            } else {
                setClass(row, "opened");
                row.lastChild.style.display = "block";
            }
        }

    }
});

// ********************************************************************************************* //
// FlowNode

function FlowNode(functionName, scriptName) {
    this.functionName = functionName;
    this.scriptName = scriptName;
    this.lineNumber = 0;
    this.invocationCount = 1;
    this.invocationMessage = "";
    this.ignoreReturnCount = 0;
    this.parent = null;
    this.children = new Array();
    this.childIndicator = "";
    this.prettyName = this.getPrettyName(scriptName);
}

FlowNode.prototype.increaseInvocationCount = function() {
    this.invocationCount++;
    this.invocationMessage = "[Invoked "+this.invocationCount+" times ]";
};
FlowNode.prototype.addChild = function(node) {
    this.children.push(node);
    node.setParent(this);
    this.childIndicator = true;
};

FlowNode.prototype.setParent = function(node) {
    this.parent = node;
};

FlowNode.prototype.toString = function() {
    return "[ "+this.functionName+" , childList ["+this.children+"]]";
};

FlowNode.prototype.hasChildren = function() {
    return (this.children.length > 0);
};

FlowNode.prototype.lastChild = function() {
    if (this.hasChildren()) {
        return this.children[this.children.length - 1];
    }
};

FlowNode.prototype.getPrettyName = function(scriptName) {
    var index = scriptName.lastIndexOf('/');
    if (index < scriptName.length) {
        return scriptName.substring( index + 1);
    } else {
        return scriptName;
    }
};

function FilterWrapper(filter) {
    this.jsdIFilter = filter;
};

FilterWrapper.prototype.toString = function() {
    return $STRF("fireTrace.filterValue", this.jsdIFilter.urlPattern);
};

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(FFlowPanel);
Firebug.registerModule(Firebug.FFlowModule);

// ********************************************************************************************* //
}});
