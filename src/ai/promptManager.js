const fs = require('fs-extra');
const path = require('path');

class PromptManager {
  constructor() {
    this.promptsDir = path.join(__dirname, '..', '..', 'prompts');
    this.userPromptsDir = path.join(process.cwd(), '.codeexplain', 'prompts');
  }

  async initialize() {
    // Ensure user prompts directory exists
    await fs.ensureDir(this.userPromptsDir);

    // Copy default prompts to user directory if they don't exist
    const defaultPrompts = await fs.readdir(this.promptsDir);
    await Promise.all(
      defaultPrompts.map(async (promptEntry) => {
        const defaultPromptPath = path.join(this.promptsDir, promptEntry);
        const userPromptPath = path.join(this.userPromptsDir, promptEntry);

        // Check if it's a file before copying
        const stat = await fs.stat(defaultPromptPath);
        if (stat.isFile()) {
          // Only copy if user doesn't have a custom version
          if (!(await fs.pathExists(userPromptPath))) {
            await fs.copy(defaultPromptPath, userPromptPath);
          }
        }
      })
    );
  }

  async getPrompt(mode) {
    // First check if user has a custom prompt
    const userPromptPath = path.join(this.userPromptsDir, `${mode}.md`);
    if (await fs.pathExists(userPromptPath)) {
      return await fs.readFile(userPromptPath, 'utf8');
    }

    // Fall back to default prompt
    const defaultPromptPath = path.join(this.promptsDir, `${mode}.md`);
    if (await fs.pathExists(defaultPromptPath)) {
      return await fs.readFile(defaultPromptPath, 'utf8');
    }

    // Log warning about missing prompt files
    console.warn(`Prompt for mode '${mode}' not found in user or default directories. Using generic fallback prompt.`);

    // If no prompt found, return a basic template
    return `You are an AI assistant that explains code.
    
Please explain the following {{language}} code file:

File: {{filePath}}

Code:
{{codeContent}}

Please provide a clear explanation in markdown format.`;
  }

  async renderPrompt(template, variables) {
    let prompt = template;
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return prompt;
  }
}

module.exports = { PromptManager };