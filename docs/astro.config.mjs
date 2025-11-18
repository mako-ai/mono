// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://mako-ai.github.io',
	base: '/mako',
	integrations: [
		starlight({
			title: 'Mako Docs',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' }],
			sidebar: [
				{
					label: 'Product',
					items: [
						{ label: 'Introduction', slug: 'intro' },
						{ label: 'PRD', slug: 'prd' },
						{ label: 'Architecture', slug: 'architecture' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Getting Started', slug: 'getting-started' },
						{ label: 'Authentication', slug: 'guides/authentication' },
						{ label: 'Building Connectors', slug: 'guides/building-connectors' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'API Reference', slug: 'api-reference' },
					],
				},
			],
		}),
	],
});
