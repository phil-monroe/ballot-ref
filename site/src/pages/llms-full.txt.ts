import { fullMarkdown } from '../markdown';

export const GET = () => new Response(fullMarkdown(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
