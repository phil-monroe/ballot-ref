import guideYaml from '../data/guide.yaml?raw';

export const GET = () => new Response(guideYaml, { headers: { 'Content-Type': 'text/yaml; charset=utf-8' } });
