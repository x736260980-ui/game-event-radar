import { validateResearch } from './contract.ts';
import { importValidatedResearch } from '@aihot/backend/events/research-import';
export async function importResearch(input:unknown,mapping:unknown){const validated=validateResearch(input,mapping);return importValidatedResearch(validated.data,validated.mapping);}
