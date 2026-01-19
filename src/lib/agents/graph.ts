import { StateGraph, END } from '@langchain/langgraph';
import { AgentState, type AgentStateType } from './types';
import { judgeAgent } from './judge-agent';
import { routerAgent } from './router-agent';
import { creatorAgent } from './creator-agent';

/**
 * AGENT PIPELINE GRAPH
 *
 * This is the "flowchart" that connects all our agents:
 *
 * START → Judge → Router → Creator → END
 *
 * Each agent:
 * 1. Reads from state (the shared "notebook")
 * 2. Does its work (calls LLM, generates content, etc.)
 * 3. Writes results back to state
 * 4. Passes state to next agent
 *
 * The graph automatically handles:
 * - Passing state between agents
 * - Error recovery
 * - Conditional routing (if judge finds no ideas, skip to END)
 */

/**
 * Create and compile the agent graph
 */
export function createAgentGraph() {
  // Create the graph with our state schema
  const workflow = new StateGraph(AgentState);

  // Add nodes (agents)
  workflow
    .addNode('judge', judgeAgent)
    .addNode('router', routerAgent)
    .addNode('creator', creatorAgent);

  // Define edges (connections between agents)

  // Start with judge
  workflow.addEdge('__start__', 'judge');

  // Conditional: If judge selected an idea, go to router. Otherwise, end.
  workflow.addConditionalEdges(
    'judge',
    (state: AgentStateType) => {
      // If no idea selected, skip to end
      if (!state.selectedIdea) {
        return 'end';
      }
      // Otherwise, continue to router
      return 'router';
    },
    {
      router: 'router',
      end: END,
    }
  );

  // Conditional: If router chose a format, go to creator. Otherwise, end.
  workflow.addConditionalEdges(
    'router',
    (state: AgentStateType) => {
      // If no format chosen, skip to end
      if (!state.chosenFormat) {
        return 'end';
      }
      // Otherwise, continue to creator
      return 'creator';
    },
    {
      creator: 'creator',
      end: END,
    }
  );

  // After creator, end the workflow
  workflow.addEdge('creator', END);

  // Compile the graph
  return workflow.compile();
}

/**
 * Execute the full agent pipeline
 *
 * This is the main entry point to run the workflow.
 *
 * @param userId - User ID
 * @param allIdeas - All pending ideas to evaluate
 * @param specificIdeaId - Optional: specific idea to expand (for manual trigger)
 * @param executionId - Unique ID for this execution (for logging)
 * @returns Final state with all results
 */
export async function runAgentPipeline({
  userId,
  allIdeas,
  specificIdeaId = null,
  executionId,
}: {
  userId: string;
  allIdeas: any[];
  specificIdeaId?: string | null;
  executionId: string;
}): Promise<AgentStateType> {
  // Create the graph
  const graph = createAgentGraph();

  // Initial state
  const initialState = {
    userId,
    allIdeas,
    specificIdeaId,
    executionId,
  };

  console.log('🚀 Starting agent pipeline...');
  console.log(`   User: ${userId}`);
  console.log(`   Ideas to evaluate: ${allIdeas.length}`);
  console.log(`   Specific idea: ${specificIdeaId || 'None (will judge all)'}`);

  // Run the graph!
  const finalState = await graph.invoke(initialState);

  console.log('✅ Agent pipeline complete!');
  console.log(`   Selected idea: ${finalState.selectedIdea?.title || 'None'}`);
  console.log(`   Chosen format: ${finalState.chosenFormat || 'None'}`);
  console.log(`   Content generated: ${finalState.generatedContent ? 'Yes' : 'No'}`);
  console.log(`   Tokens used: ${finalState.tokensUsed}`);
  console.log(`   Errors: ${finalState.errors.length}`);

  return finalState;
}
