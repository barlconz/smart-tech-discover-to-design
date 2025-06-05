const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Feature folder selection
    selectFeatureFolder: async () => {
      return await ipcRenderer.invoke('select-feature-folder');
    },
    
    // Process feature files from folder
    processFeatureFolder: async (folderPath) => {
      return await ipcRenderer.invoke('process-feature-folder', folderPath);
    },
    
    // Save Gherkin feature files
    saveFeatureFiles: async (gherkinContent) => {
      return await ipcRenderer.invoke('save-feature-files', gherkinContent);
    },
    
    // Test Jira connection
    testJiraConnection: async (jiraConfig) => {
      return await ipcRenderer.invoke('test-jira-connection', jiraConfig);
    },
    
    // Get Jira projects
    getJiraProjects: async (jiraConfig) => {
      return await ipcRenderer.invoke('get-jira-projects', jiraConfig);
    },
    
    // Get Jira issue types
    getJiraIssueTypes: async (jiraConfig) => {
      return await ipcRenderer.invoke('get-jira-issue-types', jiraConfig);
    },
    
    // Get Jira fields
    getJiraFields: async (jiraConfig) => {
      return await ipcRenderer.invoke('get-jira-fields', jiraConfig);
    },
    
    // Search Jira issues
    searchJiraIssues: async (jiraConfig, projectKey) => {
      return await ipcRenderer.invoke('search-jira-issues', { jiraConfig, projectKey });
    },
    
    // Get project-specific issue types
    getProjectIssueTypes: async (jiraConfig, projectKey) => {
      return await ipcRenderer.invoke('get-project-issue-types', { jiraConfig, projectKey });
    },
    
    // Get issue type fields
    getIssueTypeFields: async (jiraConfig, projectKey, issueTypeId) => {
      return await ipcRenderer.invoke('get-issue-type-fields', { jiraConfig, projectKey, issueTypeId });
    },
    
    // Save Jira credentials
    saveJiraCredentials: async (credentials) => {
      return await ipcRenderer.invoke('save-jira-credentials', credentials);
    },
    
    // Load Jira credentials
    loadJiraCredentials: async () => {
      return await ipcRenderer.invoke('load-jira-credentials');
    },
    
    // Clear Jira credentials
    clearJiraCredentials: async () => {
      return await ipcRenderer.invoke('clear-jira-credentials');
    },
    
    // Save OpenAI API key
    saveApiKey: async (apiKey) => {
      return await ipcRenderer.invoke('save-api-key', apiKey);
    },
    
    // Load OpenAI API key
    loadApiKey: async () => {
      return await ipcRenderer.invoke('load-api-key');
    },
    
    // Clear OpenAI API key
    clearApiKey: async () => {
      return await ipcRenderer.invoke('clear-api-key');
    },
    
    // Create Jira issues
    createJiraIssues: async (gherkinContent, jiraConfig) => {
      // Extract folderName from jiraConfig if present
      const { folderName, ...restConfig } = jiraConfig;
      return await ipcRenderer.invoke('create-jira-issues', { 
        gherkinContent, 
        jiraConfig: restConfig,
        folderName 
      });
    }
  }
);
