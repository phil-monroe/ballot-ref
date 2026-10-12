import { contests } from '../../lib';
import { raceMarkdown } from '../../markdown';

export const getStaticPaths = () => contests.map((c: any) => ({ params: { id: c.id }, props: { c } }));

export const GET = ({ props }: { props: { c: any } }) =>
  new Response(raceMarkdown(props.c), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
