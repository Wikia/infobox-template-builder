export const xmlString = `
<infobox {{#theme}}theme="{{.}}"{{/theme}} {{#themeVarName}}theme-source="{{.}}"{{/themeVarName}} {{#layout}}layout="{{.}}"{{/layout}}>
	{{#items}}
		{{#equals 'data' 'data'}}
		<h3>It's a data node type!</h3>
		{{/equals}}

		{{#equals _nodeType 'data'}}
			<data source="{{boundVariableName}}">
				{{#label}}<label>{{label}}</label>{{/label}}
				{{#defaultValue}}<default>{{defaultValue}}</default>{{/defaultValue}}
				{{#stringTemplate}}{{/stringTemplate}}
			</data>
		{{/equals}}

		<{{type}} source="{{boundVariableName}}">
			{{#label}}<label>{{label}}</label>{{/label}}
			{{#defaultValue}}<default>{{defaultValue}}</default>{{/defaultValue}}
		</{{type}}>
	{{/items}}
</infobox>
`;