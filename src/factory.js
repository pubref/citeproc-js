dojo.provide("csl.factory");
if (!CSL) {
   load("./src/csl.js");
}

/**
 * Factory functions to build the token list representation of a style.
 * <p>The functions here are invoked via {@link CSL.Core.Build} and {@link CSL.Core.Configure}.</p>
 * @namespace Factory functions to create precompiled token objects from XML source.
 */
CSL.Factory = {};


CSL.Factory.version = function(){
	var msg = "\"Entropy\" citation processor (a.k.a. citeproc-js) ver.0.01";
	print(msg);
	return msg;
};


/**
 * Convert XML node to token.
 * <p>This is called on an XML node.  After extracting the name and attribute
 * information from the node, it performs three operations.  Attribute information
 * relating to output formatting is stored on the node as an array of tuples,
 * which fixes the sequence of execution of output functions to be invoked
 * in the next phase of processing.  Other attribute information is reduced
 * to functions, and is pushed into an array on the token in no particular
 * order, for later execution.  The element name is used as a key to
 * invoke the relevant <code>build</code> method of the target element.
 * Element methods are defined in {@link CSL.Lib.Elements}.</p>
 * @param {Object} state  The state object returned by {@link CSL.Engine}.
 * @param {Int} tokentype  A CSL namespace constant (<code>CSL.START</code>,
 * <code>CSL.END</code> or <code>CSL.SINGLETON</code>.
 */
CSL.Factory.XmlToToken = function(state,tokentype){
	var name = state.sys.xml.nodename(this);
	// print(tokentype + " : " + name);
	if (state.build.skip && state.build.skip != name){
		return;
	}
	if (!name){
		var txt = state.sys.xml.content(this);
		if (txt){
			state.build.text = txt;
		}
		return;
	}
	if ( ! CSL.Lib.Elements[state.sys.xml.nodename(this)]){
		throw "Undefined node name \""+name+"\".";
	}
	var attrfuncs = new Array();
	var attributes = state.sys.xml.attributes(this);
	var decorations = CSL.Factory.setDecorations.call(this,state,attributes);
	var token = new CSL.Factory.Token(name,tokentype);
	for (var key in attributes){
		try {
			var attrfunc = CSL.Lib.Attributes[key].call(token,state,attributes[key]);
		} catch (e) {
			if (e == "TypeError: Cannot call method \"call\" of undefined"){
				throw "Unknown attribute \""+key+"\" in node \""+name+"\" while processing CSL file";
			} else {
				throw "CSL processor error, "+key+" attribute: "+e;
			}
		}
		if (attrfunc){
			attrfuncs.push(attrfunc);
		}
	}
	token.decorations = decorations;
	//
	// !!!!!: eliminate diversion of tokens to separate
	// token list (formerly used for reading in macros
	// and terms).
	//
	var target = state[state.build.area].tokens;
	CSL.Lib.Elements[name].build.call(token,state,target);
};

/**
 * Generate a separate list of formatting attributes.
 * <p>This generates a list of tuples containing attribute
 * information relevant to output formatting, in the order
 * fixed in the constant {@link CSL.FORMAT_KEY_SEQUENCE}.
 * This function is called during {@link CSL.Core.Build}.
 * Formatting hints are distilled to functions
 * later, in the second compilation pass ({@link CSL.Core.Configure}).</p>
 * @param {Object} state The state object returned by
 * {@link CSL.Engine}.
 * @param {Object} attributes The hash object containing
 * the attributes and values extracted from an XML node.
 */
CSL.Factory.setDecorations = function(state,attributes){
	// This applies a fixed processing sequence
	var ret = new Array();
	for each (var key in CSL.FORMAT_KEY_SEQUENCE){
		if (attributes[key]){
			ret.push([key,attributes[key]]);
			delete attributes[key];
		}
	}
	return ret;
};

/**
 * Generate string formatting functions.
 * <p>This function is executed in the context of a token
 * by {@link CSL.Core.Configure}.
 * The list of formatting attributes stored on the token
 * is replaced with a list of compiled functions.
 * This is applied by {@link CSL.Core.Configure}.
 * @param {Array} state The state object returned by
 * {@link CSL.Engine}.
 */
CSL.Factory.renderDecorations = function(state){
	var ret = new Array();
	for each (hint in this.decorations){
		ret.push(state.fun.decorate[hint[0]][hint[1]]);
	}
	this.decorations = ret;
};


/**
 * Substitution gadget.
 * <p>Creates a function for
 * delivering a string merged to a pre-defined template
 * with a minimum of fuss.</p>
 * @param {String} template A template containing
 * a <code>%%STRING%%</code> placeholder.  See
 * {@link CSL.Output.Formats.html} for examples.
 */
CSL.Factory.substituteOne = function(template) {
	return function(state,list) {
		if (!list){
			return "";
		} else if ("string" == typeof list){
			return template.replace("%%STRING%%",list);
		};
		print("USING is_delimiter (1) ... WHY?");
		var decor = template.split("%%STRING%%");
		var ret = [{"is_delimiter":true,"value":decor[0]}].concat(list);
		ret.push({"is_delimiter":true,"value":decor[1]});
		return ret;
	};
};


/**
 * Two-tiered substitutions gadget.
 * <p>This is used for
 * options like (now defunct) "font-family", where the option value
 * cannot be determined until the attribute is processed.
 * Need for this function might be reviewed at some point ...</p>
 * @param {String} template A template containing
 * <code>%%STRING%%</code> and <code>%%PARAM%%</code>
 * placeholders.  See {@link CSL.Output.Formats.html} for
 * examples.
 */
CSL.Factory.substituteTwo = function(template) {
	return function(param) {
		var template2 = template.replace("%%PARAM%%", param);
		return function(state,list) {
			if ("string" == typeof list){
				return template2.replace("%%STRING%%",list);
			}
			print("USING is_delimiter (2) ... WHY?");
			var decor = template2.split("%%STRING");
			var ret = [{"is_delimiter":true,"value":decor[0]}].concat(list);
			ret.push({"is_delimiter":true,"value":decor[1]});
			return ret;
		};
	};
};

/**
 * Generate string functions for designated output mode.
 * <p>Only "html" (the default) is supported at present.</p>
 * @param {String} mode Either "html" or "rtf", eventually.
 */
CSL.Factory.Mode = function(mode){
	var decorations = new Object();

	var params = CSL.Output.Formats[mode];
	for (var param in params) {
		if ("@" != param[0]){
			decorations[param] = params[param];
			continue;
		}
		var func = false;
		var val = params[param];
		var args = param.split('/');

		if (typeof val == "string" && val.indexOf("%%STRING%%") > -1)  {
			if (val.indexOf("%%PARAM%%") > -1) {
				func = CSL.Factory.substituteTwo(val);
			} else {
				func = CSL.Factory.substituteOne(val);
			}
		} else if (typeof val == "boolean" && !val) {
			func = CSL.Output.Formatters.passthrough;
		} else if (typeof val == "function") {
			func = val;
		} else {
			throw "CSL.Compiler: Bad "+mode+" config entry for "+param+": "+val;
		}

		if (args.length == 1) {
			decorations[args[0]] = func;
		} else if (args.length == 2) {
			if (!decorations[args[0]]) {
				decorations[args[0]] = new Object();
			}
			decorations[args[0]][args[1]] = func;
		}
	}
	return decorations;
};


/**
 * Macro expander.
 * <p>Called on the state object.</p>
 */
CSL.Factory.expandMacro = function(macro_key_token){
	var mkey = macro_key_token.postponed_macro;
	if (this.build.macro_stack.indexOf(mkey) > -1){
		throw "CSL processor error: call to macro \""+mkey+"\" would cause an infinite loop";
	} else {
		this.build.macro_stack.push(mkey);
	}
	var start_token = new CSL.Factory.Token("group",CSL.START);
	start_token.decorations = this.decorations;
	for (var i in macro_key_token.strings){
		start_token.strings[i] = macro_key_token.strings[i];
	}
	var newoutput = function(state,Item){
		//state.output.openLevel(this);
		state.output.startTag("group",this);
		//state.tmp.decorations.push(this.decorations);
	};
	start_token["execs"].push(newoutput);
	this[this.build.area].tokens.push(start_token);
	//
	// Here's where things change pretty dramatically.  We pull
	// macros out of E4X directly, and process them using the
	// same combination of tree walker and tag processor that
	// led us here, but with a different queue.
	//
	default xml namespace = "http://purl.org/net/xbiblio/csl"; with({});
	//default xml namespace = "http://purl.org/net/xbiblio/csl";
	var macroxml = this.cslXml..macro.(@name == mkey);
	if (!macroxml.toString()){
		throw "CSL style error: undefined macro \""+mkey+"\"";
	}
	var navi = new this._getNavi( this, macroxml );
	this._build(navi);

	var end_token = new CSL.Factory.Token("group",CSL.END);
	var mergeoutput = function(state,Item){
		//
		// rendering happens inside the
		// merge method, by applying decorations to
		// each token to be merged.
		state.output.endTag();
		//state.output.closeLevel();
	};
	end_token["execs"].push(mergeoutput);
	this[this.build.area].tokens.push(end_token);

	this.build.macro_stack.pop();
};


CSL.Factory.cloneAmbigConfig = function(config){
	var ret = new Object();
	ret["names"] = new Array();
	ret["givens"] = new Array();
	ret["year_suffix"] = false;
	ret["disambiguate"] = false;
	for (var i in config["names"]){
		var param = config["names"][i];
		ret["names"][i] = param;
	}
	for (var i in config["givens"]){
		var param = new Array();
		for (var j in config["givens"][i]){
			//
			// XXXX: Aha again!  Givens sublist is acquiring an item at position -1.
			// Classic stab-in-the-back Javascript breakage.  A hacked-in fix for
			// now, this should be properly cleaned up sometime, though.
			//
			if (j > -1){
				param.push(config["givens"][i][j]);
			};
		};
		ret["givens"].push(param);
	};
	ret["year_suffix"] = config["year_suffix"];
	ret["disambiguate"] = config["disambiguate"];
	return ret;
};
