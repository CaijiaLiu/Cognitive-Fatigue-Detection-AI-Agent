import { loadPublicCatalog, buildAgentContext } from '../analysis/src/neurolens/public-data/cognitive-lab.mjs';

const [command = 'overview', file, ...extra] = process.argv.slice(2);
if (extra.length || !['overview', 'board', 'fatigue'].includes(command)
    || (command === 'board' && !file) || (command !== 'board' && file)) {
  console.error('Usage: node scripts/public-data-agent.mjs overview | board SOURCE_FILENAME | fatigue');
  process.exitCode = 2;
} else {
  try {
    const catalog = await loadPublicCatalog();
    const request = command === 'board' ? { tool: 'get_board', file }
      : { tool: command === 'overview' ? 'overview' : 'predict_fatigue' };
    console.log(JSON.stringify(buildAgentContext(catalog, request), null, 2));
  } catch (error) {
    console.error(`Public dataset refused: ${error.message}`);
    process.exitCode = 1;
  }
}
