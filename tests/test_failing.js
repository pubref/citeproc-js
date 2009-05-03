dojo.provide("tests.test_failing");


var style = false;
var Item = false;

doh.registerGroup("tests.failing",
	[
		function testTwoHello(){
			var xml = "<style>"
					  + "<citation>"
					  + "<layout>"
					  + "<text value=\"Hello again, world!\"/>"
					  + "<text font-style=\"italic\" value=\"Hello world!\"/>"
					  + "</layout>"
					  + "</citation>"
				+ "</style>";

			var cite = tests.test_failing.makeCite(xml);
			doh.assertEqual("Hello again, world!<i>Hello world!</i>",cite);
		}
	],
	function(){  //setup
		tests.test_failing.makeCite = function(xml){
			var builder = new CSL.Core.Build(xml);
			var raw = builder.build();
			var configurator = new CSL.Core.Configure(raw);
			style = configurator.configure();
			var Item = [{}];
			var ret = style.makeCitationCluster(Item);
			return ret;
		};
	},
	function(){	// teardown
	}

);
