const data = `
<data source="{{boundVariableName}}">
	{{#label}}<label>{{.}}</label>{{/label}}
	{{#defaultValue}}<default>{{.}}</default>{{/defaultValue}}
	{{#stringTemplate}}{{/stringTemplate}}
</data>`;

const image = `
<image source="{{boundVariableName}}">
	{{#caption}}
		<caption source=""></caption>
	{{/caption}}
	{{#defaultValue}}<default>{{.}}</default>{{/defaultValue}}
</image>`;

const title = `
<title source="{{boundVariableName}}">
	{{#label}}<label>{{.}}</label>{{/label}}
	{{#defaultValue}}<default>{{.}}</default>{{/defaultValue}}
</title>`;

// headers within groups use the title _nodeType
const header = `
<header source="{{boundVariableName}}">
	{{#label}}<label>{{.}}</label>{{/label}}
	{{#defaultValue}}<default>{{.}}</default>{{/defaultValue}}
</header>`;


export const xmlString = `
<infobox
	{{#theme}}theme="{{.}}"{{/theme}}
	{{#themeVarName}}theme-source="{{.}}"{{/themeVarName}}
	{{#layout}}layout="{{.}}"{{/layout}}>

	{{#each items as |item|}}
		{{#equals _nodeType 'data'}}${data}{{/equals}}
		{{#equals _nodeType 'image'}}${image}{{/equals}}
		{{#equals _nodeType 'title'}}${title}{{/equals}}

		{{#equals _nodeType 'group'}}
			<group>
				{{#each item.items as |groupItem|}}
					{{#equals groupItem._nodeType 'data'}}${data}{{/equals}}
					{{#equals groupItem._nodeType 'image'}}${image}{{/equals}}
					{{#equals groupItem._nodeType 'title'}}${header}{{/equals}}
				{{/each}}
			</group>
		{{/equals}}
	{{/each}}
</infobox>
`;