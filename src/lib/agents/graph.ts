import { StateGraph, END } from '@langchain/langgraph';
import { AgentState, type AgentStateType } from './types';
import { routerAgent } from './router-agent';
import { creatorAgent } from './creator-agent';
import type { Logger } from '../logging/logger';
import type { Idea } from '@/lib/db/types';

/**
 * AGENT PIPELINE GRAPH
 *
 * This is the "flowchart" that connects all our agents:
 *
 * START → Router → Creator → END
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
 */

/**
 * Create and compile the agent graph
 */
export function createAgentGraph() {
  // Create the graph with our state schema
  const workflow = new StateGraph(AgentState);

  // Add nodes (agents)
  workflow
    .addNode('router', routerAgent)
    .addNode('creator', creatorAgent);

  // Define edges (connections between agents)

  // Set entry point (where the graph starts)
  // @ts-expect-error - LangGraph types don't properly infer node names
  workflow.addEdge('__start__', 'router');

  // Linear flow: Router decides format → Creator generates content
  // @ts-expect-error - LangGraph types don't properly infer node names
  workflow.addEdge('router', 'creator');

  // Set finish point (where the graph ends)
  // @ts-expect-error - LangGraph types don't properly infer node names
  workflow.addEdge('creator', '__end__');

  // Compile the graph
  return workflow.compile();
}

/**
 * Execute the full agent pipeline
 *
 * This is the main entry point to run the workflow.
 *
 * @param userId - User ID
 * @param selectedIdea - The idea to expand (user-selected)
 * @param executionId - Unique ID for this execution (for logging)
 * @param logger - Logger instance for tracking execution
 * @returns Final state with all results
 */
export async function runAgentPipeline({
  userId,
  selectedIdea,
  executionId,
  logger,
}: {
  userId: string;
  selectedIdea: Idea;
  executionId: string;
  logger: Logger;
}): Promise<AgentStateType> {
  // Create the graph
  const graph = createAgentGraph();

  // Create child logger for graph orchestration
  const graphLogger = logger.child({ stage: 'graph-orchestrator' });

  // Initial state
  const initialState = {
    userId,
    selectedIdea,
    executionId,
    logger,
  } as Partial<AgentStateType>;

  graphLogger.info('🚀 Starting agent pipeline', {
    userId,
    ideaId: selectedIdea.id,
    ideaTitle: selectedIdea.title,
  });

  // Run the graph!
  const finalState = await graph.invoke(initialState);

  graphLogger.info('✅ Agent pipeline complete', {
    selectedIdea: finalState.selectedIdea?.title || 'None',
    chosenFormat: finalState.chosenFormat || 'None',
    contentGenerated: !!finalState.generatedContent,
    errorCount: finalState.errors.length,
    durationMs: graphLogger.getDuration(),
  });

  return finalState;
}
