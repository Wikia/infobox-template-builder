'use strict';

export function equals(leftVal, rightVal, options) {
	if (arguments.length < 3)
		throw new Error("Handlebars Helper equal needs 2 parameters");
	if(leftVal !== rightVal) {
		return options.inverse(this);
	} else {
		return options.fn(this);
	}
}

// Implementation from http://stackoverflow.com/a/2893259
export function formatXml(xml) {
	let reg = /(>)\s*(<)(\/*)/g;
	let wsexp = / *(.*) +\n/g;
	let contexp = /(<.+>)(.+\n)/g;
	xml = xml.replace(reg, '$1\n$2$3').replace(wsexp, '$1\n').replace(contexp, '$1\n$2');
	let formatted = '';
	let lines = xml.split('\n');
	let indent = 0;
	let lastType = 'other';
	// 4 types of tags - single, closing, opening, other (text, doctype, comment) - 4*4 = 16 transitions
	let transitions = {
		'single->single': 0,
		'single->closing': -1,
		'single->opening': 0,
		'single->other': 0,
		'closing->single': 0,
		'closing->closing': -1,
		'closing->opening': 0,
		'closing->other': 0,
		'opening->single': 1,
		'opening->closing': 0,
		'opening->opening': 1,
		'opening->other': 1,
		'other->single': 0,
		'other->closing': -1,
		'other->opening': 0,
		'other->other': 0
	};

	for (let i = 0; i < lines.length; i++) {
		let ln = lines[i];
		let single = Boolean(ln.match(/<.+\/>/)); // is this line a single tag? ex. <br />
		let closing = Boolean(ln.match(/<\/.+>/)); // is this a closing tag? ex. </a>
		let opening = Boolean(ln.match(/<[^!].*>/)); // is this even a tag (that's not <!something>)
		let type = single ? 'single' : closing ? 'closing' : opening ? 'opening' : 'other';
		let fromTo = lastType + '->' + type;
		lastType = type;
		let padding = '';

		indent += transitions[fromTo];

		for (var j = 0; j < indent; j++) {
			padding += '\t';
		}

		if (fromTo === 'opening->closing') {
			// substr removes line break (\n) from prev loop
			formatted = formatted.substr(0, formatted.length - 1) + ln + '\n';
		}

		else {
			formatted += padding + ln + '\n';
		}
	}

	return formatted;
}
