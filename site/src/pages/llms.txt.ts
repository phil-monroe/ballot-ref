import { indexMarkdown } from '../markdown';

export const GET = () => new Response(indexMarkdown(''), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
