FBL.ns(function() { with (FBL) {

// ********************************************************************************************* //
// Constants

function FFlowScriptPanel() {}
FFlowScriptPanel.prototype = extend(Firebug.Panel,
{
    name:"fFlowScriptPanel",
    parentPanel: "script",
    title: "FireFlow",
    enableAlly: true,

    initialize: function(context, doc)
    {
        Firebug.Panel.initialize.apply(this, arguments);
        appendStylesheet(doc, "chrome://fireflow/skin/classic/fireflow.css");
    },

    show: function(state)
    {
        Firebug.Panel.show.apply(this, arguments);
        this.refresh();
    },

    hide: function()
    {
        Firebug.Panel.hide.apply(this, arguments);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(FFlowScriptPanel);

// ********************************************************************************************* //
}});
