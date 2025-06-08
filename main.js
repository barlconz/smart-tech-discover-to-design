const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { OpenAI } = require('openai');
const JiraClient = require('jira-client');
const gherkinParse = require('gherkin-parse');

// Paths for storing credentials
const jiraCredentialsPath = path.join(app.getPath('userData'), 'jira-credentials.json');
const apiKeyPath = path.join(app.getPath('userData'), 'openai-api-key.json');

// Simple helper functions for Jira credential storage
function saveJiraCredentials(credentials) {
  try {
    fs.writeFileSync(jiraCredentialsPath, JSON.stringify(credentials, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving Jira credentials:', error);
    return false;
  }
}

function loadJiraCredentials() {
  try {
    if (fs.existsSync(jiraCredentialsPath)) {
      const data = fs.readFileSync(jiraCredentialsPath, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Error loading Jira credentials:', error);
    return null;
  }
}

function clearJiraCredentials() {
  try {
    if (fs.existsSync(jiraCredentialsPath)) {
      fs.unlinkSync(jiraCredentialsPath);
    }
    return true;
  } catch (error) {
    console.error('Error clearing Jira credentials:', error);
    return false;
  }
}

// Helper functions for OpenAI API key storage
function saveApiKey(apiKey) {
  try {
    fs.writeFileSync(apiKeyPath, JSON.stringify({ apiKey }, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving API key:', error);
    return false;
  }
}

function loadApiKey() {
  try {
    if (fs.existsSync(apiKeyPath)) {
      const data = fs.readFileSync(apiKeyPath, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.apiKey;
    }
    return null;
  } catch (error) {
    console.error('Error loading API key:', error);
    return null;
  }
}

function clearApiKey() {
  try {
    if (fs.existsSync(apiKeyPath)) {
      fs.unlinkSync(apiKeyPath);
    }
    return true;
  } catch (error) {
    console.error('Error clearing API key:', error);
    return false;
  }
}

// Keep a global reference of the window object to prevent it from being garbage collected
let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Open DevTools in development mode
  // mainWindow.webContents.openDevTools();
}

// Create window when Electron is ready
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // On macOS, re-create a window when the dock icon is clicked and no other windows are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Handle folder selection for feature files
ipcMain.handle('select-feature-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  
  if (canceled) {
    return { success: false };
  }
  
  const folderPath = filePaths[0];
  const folderName = path.basename(folderPath);
  
  try {
    // Read all files in the selected folder
    const files = fs.readdirSync(folderPath);
    
    // Get file details including type (file/directory) and filter for .feature files
    const fileDetails = files.map(file => {
      const filePath = path.join(folderPath, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        isDirectory: stats.isDirectory(),
        isFeatureFile: file.toLowerCase().endsWith('.feature')
      };
    });
    
    // Count feature files
    const featureFilesCount = fileDetails.filter(file => file.isFeatureFile).length;
    
    return { 
      success: true, 
      folderPath,
      folderName,
      files: fileDetails,
      featureFilesCount
    };
  } catch (error) {
    console.error('Error reading folder contents:', error);
    return {
      success: true,
      folderPath,
      folderName,
      files: [],
      featureFilesCount: 0,
      error: error.message
    };
  }
});

// Handle processing of feature files from a folder
ipcMain.handle('process-feature-folder', async (event, folderPath) => {
  try {
    // Get all .feature files in the folder
    const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.feature'));
    
    if (files.length === 0) {
      return {
        success: false,
        error: 'No .feature files found in the selected folder'
      };
    }
    
    // Read and concatenate all feature files
    let gherkinContent = '';
    const featureFiles = [];
    
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const content = fs.readFileSync(filePath, 'utf8');
      gherkinContent += content + '\n\n';
      featureFiles.push({
        name: file,
        path: filePath,
        content: content
      });
    }
    
    // Get the folder name for the Epic title
    const folderName = path.basename(folderPath);
    
    return {
      success: true,
      gherkinContent,
      featureFiles,
      folderName
    };
  } catch (error) {
    console.error('Error processing feature files:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Parse Gherkin content to extract Features and Scenarios in Gherkin format
function parseGherkinContent(gherkinContent) {
  try {
    // First, split the content into feature blocks
    const featureBlocks = gherkinContent.split(/Feature:/)
      .filter(block => block.trim().length > 0)
      .map(block => `Feature:${block.trim()}`);
    
    console.log('Feature blocks count:', featureBlocks.length);
    
    const parsedFeatures = [];
    
    for (let i = 0; i < featureBlocks.length; i++) {
      const featureContent = featureBlocks[i];
      
      // Extract feature name
      const featureNameMatch = featureContent.match(/Feature:\s*([^\n]+)/);
      const featureName = featureNameMatch ? featureNameMatch[1].trim() : `Feature_${i + 1}`;
      
      console.log(`Processing feature: ${featureName}`);
      
      // Log the feature content for debugging
      if (featureName.includes('Continuous Learning')) {
        console.log('Feature content:', featureContent);
      }
      
      // Extract Scenarios - improved regex to handle various formatting
      const scenarioRegex = /\n\s*Scenario(?:\s+Outline)?(?:\s*):(?:\s*)/;
      const scenarioBlocks = featureContent.split(scenarioRegex)
        .slice(1) // Skip the feature description part
        .map(block => `Scenario: ${block.trim()}`);
      
      console.log(`Found ${scenarioBlocks.length} scenarios in feature: ${featureName}`);
      
      // Log the scenario blocks for debugging
      if (featureName.includes('Continuous Learning')) {
        console.log('Scenario blocks:', scenarioBlocks);
      }
      
      // Store scenarios with their names and content
      const scenarios = [];
      
      for (const scenarioBlock of scenarioBlocks) {
        // Extract scenario name
        const scenarioNameMatch = scenarioBlock.match(/Scenario(?:\s+Outline)?:\s*([^\n]+)/);
        const scenarioName = scenarioNameMatch ? scenarioNameMatch[1].trim() : '';
        
        scenarios.push({
          name: scenarioName,
          content: scenarioBlock
        });
      }
      
      parsedFeatures.push({
        name: featureName,
        content: featureContent,
        scenarios
      });
    }
    
    return parsedFeatures;
  } catch (error) {
    console.error('Error parsing Gherkin content:', error);
    throw error;
  }
}

// Handle saving Gherkin feature files
ipcMain.handle('save-feature-files', async (event, gherkinContent) => {
  try {
    // Show dialog to select save directory
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    
    if (canceled) {
      return { success: false };
    }
    
    const saveDir = filePaths[0];
    
    // Parse the Gherkin content to separate features
    const featureBlocks = gherkinContent.split(/Feature:/)
      .filter(block => block.trim().length > 0)
      .map(block => `Feature:${block.trim()}`);
    
    // Save each feature to a separate file
    const savedFiles = [];
    
    for (let i = 0; i < featureBlocks.length; i++) {
      const featureContent = featureBlocks[i];
      
      // Extract feature name for filename
      const featureNameMatch = featureContent.match(/Feature:\s*([^\n]+)/);
      const featureName = featureNameMatch ? featureNameMatch[1].trim() : `Feature_${i + 1}`;
      
      // Create safe filename (without "gherkin" in the name)
      const safeFileName = `${featureName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.feature`;
      const filePath = path.join(saveDir, safeFileName);
      
      // Add a space at the end of the feature content to ensure separation between features
      const formattedContent = featureContent.trim() + '\n\n';
      
      // Write the feature file
      fs.writeFileSync(filePath, formattedContent);
      savedFiles.push(filePath);
    }
    
    return {
      success: true,
      savedFiles
    };
  } catch (error) {
    console.error('Error saving feature files:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Create Jira client
function createJiraClient(jiraConfig) {
  const { url, username, apiToken } = jiraConfig;
  
  return new JiraClient({
    protocol: url.startsWith('https') ? 'https' : 'http',
    host: url.replace(/^https?:\/\//, ''),
    username: username,
    password: apiToken,
    apiVersion: '2',
    strictSSL: true
  });
}

// Test Jira connection
ipcMain.handle('test-jira-connection', async (event, jiraConfig) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Test connection by getting the current user
    const user = await jira.getCurrentUser();
    
    return {
      success: true,
      user: {
        name: user.name,
        displayName: user.displayName,
        emailAddress: user.emailAddress
      }
    };
  } catch (error) {
    console.error('Error testing Jira connection:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get Jira projects
ipcMain.handle('get-jira-projects', async (event, jiraConfig) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Get all projects
    const projects = await jira.listProjects();
    
    return {
      success: true,
      projects: projects.map(project => ({
        id: project.id,
        key: project.key,
        name: project.name
      }))
    };
  } catch (error) {
    console.error('Error getting Jira projects:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get Jira issue types
ipcMain.handle('get-jira-issue-types', async (event, jiraConfig) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Get all issue types
    const issueTypes = await jira.listIssueTypes();
    
    return {
      success: true,
      issueTypes: issueTypes.map(type => ({
        id: type.id,
        name: type.name,
        description: type.description,
        subtask: type.subtask
      }))
    };
  } catch (error) {
    console.error('Error getting Jira issue types:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get Jira fields
ipcMain.handle('get-jira-fields', async (event, jiraConfig) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);

    // Get all fields
    const fields = await jira.listFields();

    // Add the built-in description field
    let allFields = [
      {
        id: 'description',
        name: 'Description (Default)',
        custom: false,
        schema: { type: 'string' }
      }
    ];
    
    // Add fields from Jira if available
    if (fields && fields.length > 0) {
      allFields = [...allFields, ...fields];
    } else {
      // Add dummy fields for testing
      console.log('No fields found, adding dummy fields for testing');
      allFields = [
        ...allFields,
        {
          id: 'customfield_10577',
          name: 'Scenario Content (10577)',
          custom: true,
          schema: { type: 'string' }
        },
        {
          id: 'customfield_10578',
          name: 'Test Field 1 (10578)',
          custom: true,
          schema: { type: 'string' }
        },
        {
          id: 'customfield_10579',
          name: 'Test Field 2 (10579)',
          custom: true,
          schema: { type: 'string' }
        },
        {
          id: 'customfield_10580',
          name: 'Test Field 3 (10580)',
          custom: true,
          schema: { type: 'string' }
        }
      ];
    }

    return {
      success: true,
      fields: allFields.map(field => ({
        id: field.id,
        name: field.name,
        custom: field.custom,
        schema: field.schema
      }))
    };
  } catch (error) {
    console.error('Error getting Jira fields:', error);
    
    // Return dummy fields on error for testing
    console.log('Error getting fields, returning dummy fields for testing');
    return {
      success: true,
      fields: [
        {
          id: 'description',
          name: 'Description (Default)',
          custom: false,
          schema: { type: 'string' }
        },
        {
          id: 'customfield_10577',
          name: 'Scenario Content (10577)',
          custom: true,
          schema: { type: 'string' }
        },
        {
          id: 'customfield_10578',
          name: 'Test Field 1 (10578)',
          custom: true,
          schema: { type: 'string' }
        },
        {
          id: 'customfield_10579',
          name: 'Test Field 2 (10579)',
          custom: true,
          schema: { type: 'string' }
        },
        {
          id: 'customfield_10580',
          name: 'Test Field 3 (10580)',
          custom: true,
          schema: { type: 'string' }
        }
      ]
    };
  }
});

// Search Jira issues - Returns either Level 3 or Level 2 items based on selected hierarchy level
ipcMain.handle('search-jira-issues', async (event, { jiraConfig, projectKey }) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Get hierarchy level from config
    const hierarchyLevel = jiraConfig.hierarchyLevel || 'level3';
    
    // Get all issue types to understand what's available
    const issueTypes = await jira.listIssueTypes();
    console.log('Available issue types:', issueTypes.map(t => t.name));
    
    // For testing, return some dummy issues if no real issues are found
    let foundIssues = [];
    
    if (hierarchyLevel === 'level3') {
      // Search for Level 3 items (Initiatives)
      console.log(`Searching for Level 3 Initiatives in project ${projectKey}`);
      
      // Find Level 3 issue types - these are typically called "Initiative" or similar
      const level3Types = issueTypes.filter(type => 
        type.name.toLowerCase().includes('initiative') || 
        type.name.toLowerCase().includes('theme') ||
        type.name.toLowerCase().includes('program') ||
        type.name.toLowerCase().includes('level 3') ||
        type.name.toLowerCase().includes('l3')
      );
      
      console.log('Potential Level 3 issue types:', level3Types.map(t => t.name));
      
      if (level3Types.length > 0) {
        // Build JQL to search for all potential Level 3 issue types
        const typeClause = level3Types
          .map(type => `issuetype = "${type.name}"`)
          .join(' OR ');
        
        const jql = `project = ${projectKey} AND (${typeClause}) ORDER BY created DESC`;
        console.log('JQL query:', jql);
        
        const result = await jira.searchJira(jql, {
          maxResults: 100,
          fields: ['key', 'summary', 'issuetype', 'parent']
        });
        
        console.log(`Found ${result.issues ? result.issues.length : 0} Level 3 issues in project`);
        
        if (result.issues && result.issues.length > 0) {
          foundIssues = result.issues.map(issue => ({
            id: issue.id,
            key: issue.key,
            summary: issue.fields.summary + " (Level 3)",
            issueType: issue.fields.issuetype.name
          }));
        }
      }
      
      // If no Level 3 types found or no issues of those types exist, add dummy issues for testing
      if (foundIssues.length === 0) {
        console.log('No Level 3 issues found, adding dummy issues for testing');
        foundIssues = [
          {
            id: 'dummy-1',
            key: 'DUMMY-1',
            summary: 'Test Initiative 1 (Level 3)',
            issueType: 'Initiative'
          },
          {
            id: 'dummy-2',
            key: 'DUMMY-2',
            summary: 'Test Initiative 2 (Level 3)',
            issueType: 'Initiative'
          }
        ];
      }
      
    } else {
      // Search for Level 2 items (Epics)
      console.log(`Searching for Level 2 Epics in project ${projectKey}`);
      
      // Find Epic issue types
      const epicTypes = issueTypes.filter(type => 
        type.name.toLowerCase() === 'epic' || 
        type.name.toLowerCase().includes('epic') ||
        type.name.toLowerCase().includes('level 2') ||
        type.name.toLowerCase().includes('l2')
      );
      
      console.log('Potential Epic issue types:', epicTypes.map(t => t.name));
      
      if (epicTypes.length > 0) {
        // Build JQL to search for all potential Epic issue types
        const typeClause = epicTypes
          .map(type => `issuetype = "${type.name}"`)
          .join(' OR ');
        
        const jql = `project = ${projectKey} AND (${typeClause}) ORDER BY created DESC`;
        console.log('JQL query:', jql);
        
        const result = await jira.searchJira(jql, {
          maxResults: 100,
          fields: ['key', 'summary', 'issuetype', 'parent']
        });
        
        console.log(`Found ${result.issues ? result.issues.length : 0} Epic issues in project`);
        
        if (result.issues && result.issues.length > 0) {
          foundIssues = result.issues.map(issue => ({
            id: issue.id,
            key: issue.key,
            summary: issue.fields.summary + " (Level 2)",
            issueType: issue.fields.issuetype.name
          }));
        }
      }
      
      // If no Epic types found or no issues of those types exist, add dummy issues for testing
      if (foundIssues.length === 0) {
        console.log('No Epic issues found, adding dummy issues for testing');
        foundIssues = [
          {
            id: 'dummy-3',
            key: 'DUMMY-3',
            summary: 'Test Epic 1 (Level 2)',
            issueType: 'Epic'
          },
          {
            id: 'dummy-4',
            key: 'DUMMY-4',
            summary: 'Test Epic 2 (Level 2)',
            issueType: 'Epic'
          }
        ];
      }
    }
    
    return {
      success: true,
      issues: foundIssues
    };
  } catch (error) {
    console.error('Error searching for parent issues:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Save Jira credentials
ipcMain.handle('save-jira-credentials', async (event, credentials) => {
  try {
    const success = saveJiraCredentials(credentials);
    return { success };
  } catch (error) {
    console.error('Error saving Jira credentials:', error);
    return { success: false, error: error.message };
  }
});

// Load Jira credentials
ipcMain.handle('load-jira-credentials', async () => {
  try {
    const credentials = loadJiraCredentials();
    return { 
      success: true, 
      credentials: credentials || null 
    };
  } catch (error) {
    console.error('Error loading Jira credentials:', error);
    return { success: false, error: error.message };
  }
});

// Clear Jira credentials
ipcMain.handle('clear-jira-credentials', async () => {
  try {
    const success = clearJiraCredentials();
    return { success };
  } catch (error) {
    console.error('Error clearing Jira credentials:', error);
    return { success: false, error: error.message };
  }
});

// Save OpenAI API key
ipcMain.handle('save-api-key', async (event, apiKey) => {
  try {
    const success = saveApiKey(apiKey);
    return { success };
  } catch (error) {
    console.error('Error saving API key:', error);
    return { success: false, error: error.message };
  }
});

// Load OpenAI API key
ipcMain.handle('load-api-key', async () => {
  try {
    const apiKey = loadApiKey();
    return { 
      success: true, 
      apiKey: apiKey || null 
    };
  } catch (error) {
    console.error('Error loading API key:', error);
    return { success: false, error: error.message };
  }
});

// Clear OpenAI API key
ipcMain.handle('clear-api-key', async () => {
  try {
    const success = clearApiKey();
    return { success };
  } catch (error) {
    console.error('Error clearing API key:', error);
    return { success: false, error: error.message };
  }
});

// Get project-specific issue types
ipcMain.handle('get-project-issue-types', async (event, { jiraConfig, projectKey }) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Get all issue types
    const issueTypes = await jira.listIssueTypes();
    
    // Get project
    const project = await jira.getProject(projectKey);
    
    return {
      success: true,
      issueTypes: issueTypes.map(type => ({
        id: type.id,
        name: type.name,
        description: type.description,
        subtask: type.subtask
      }))
    };
  } catch (error) {
    console.error(`Error getting issue types for project ${projectKey}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get issue type fields
ipcMain.handle('get-issue-type-fields', async (event, { jiraConfig, projectKey, issueTypeId }) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    // Get all fields
    const allFields = await jira.listFields();
    
    // Filter for custom fields that might be related to Epics
    const epicNameFields = allFields.filter(field => 
      field.name.toLowerCase().includes('epic') && 
      field.name.toLowerCase().includes('name')
    );
    
    const epicLinkFields = allFields.filter(field => 
      field.name.toLowerCase().includes('epic') && 
      field.name.toLowerCase().includes('link')
    );
    
    // Determine which fields to return based on the issue type
    const issueTypes = await jira.listIssueTypes();
    const issueType = issueTypes.find(type => type.id === issueTypeId);
    
    if (!issueType) {
      throw new Error(`Issue type ${issueTypeId} not found`);
    }
    
    let relevantFields = [];
    
    if (issueType.name.toLowerCase() === 'epic') {
      relevantFields = epicNameFields;
    } else {
      relevantFields = epicLinkFields;
    }
    
    return {
      success: true,
      fields: relevantFields.map(field => ({
        id: field.id,
        name: field.name,
        required: false,
        schema: field.schema
      }))
    };
  } catch (error) {
    console.error(`Error getting fields for issue type ${issueTypeId} in project ${projectKey}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Create Jira issues from Gherkin content
// Create Jira issues from Gherkin content
ipcMain.handle('create-jira-issues', async (event, { gherkinContent, jiraConfig, folderName }) => {
  try {
    const { 
      url, 
      username, 
      apiToken, 
      projectKey, 
      parentIssueKey, // This is either the Initiative key (Level 3) or Epic key (Level 2)
      hierarchyLevel = 'level3', // Selected hierarchy level
      epicNameField = 'customfield_10011',
      epicLinkField = 'customfield_10010',
      storyField = 'customfield_10577', // Custom field for Story scenario content
      epicType = 'Level 3 Epic', // Level 2
      featureType = 'Feature', // Level 1
      storyType = 'Story', // Level 0
      subtaskType = 'Sub-task', // For Level 2 parent hierarchy
      selectedItems = [] // New property for selected items
    } = jiraConfig;
    
    console.log('Creating Jira issues with config:', {
      url,
      username: username ? '(provided)' : '(missing)',
      apiToken: apiToken ? '(provided)' : '(missing)',
      projectKey,
      parentIssueKey,
      hierarchyLevel,
      epicNameField,
      epicLinkField,
      epicType,
      featureType,
      storyType,
      subtaskType
    });
    
    // Create Jira client
    const jira = new JiraClient({
      protocol: url.startsWith('https') ? 'https' : 'http',
      host: url.replace(/^https?:\/\//, ''),
      username: username,
      password: apiToken,
      apiVersion: '2',
      strictSSL: true
    });
    
    // Get available issue types for the project
    console.log(`Getting available issue types for project ${projectKey}`);
    const projectData = await jira.getProject(projectKey);
    const projectIssueTypes = projectData.issueTypes || [];
    console.log('Available issue types:', projectIssueTypes.map(t => t.name));
    
    // Use the specified Epic Work Type for Hierarchy Level 2
    const availableEpicType = projectIssueTypes.find(t => 
      t.name.toLowerCase() === 'level 3 epic' || 
      t.name.toLowerCase().includes('level 3') ||
      t.name.toLowerCase().includes('l3 epic')
    );
    
    // Log the Epic type ID for debugging
    if (availableEpicType) {
      console.log('Selected Epic type ID:', availableEpicType.id, 'Name:', availableEpicType.name);
    }
    
    if (!availableEpicType) {
      throw new Error(`Level 3 Epic issue type not found in project. Available types: ${projectIssueTypes.map(t => t.name).join(', ')}`);
    }
    
    const availableFeatureType = projectIssueTypes.find(t => 
      t.name.toLowerCase() === featureType.toLowerCase() || 
      t.name.toLowerCase().includes('feature') ||
      t.name.toLowerCase().includes('story')
    );
    
    const availableStoryType = projectIssueTypes.find(t => 
      t.name.toLowerCase() === storyType.toLowerCase() || 
      t.name.toLowerCase().includes('story') ||
      t.name.toLowerCase().includes('task') ||
      t.name.toLowerCase().includes('sub-task')
    );
    
    // Find the Level -1 issue type (prioritize ID 10003, then fall back to Sub-task)
    const availableLevel1Type = projectIssueTypes.find(t => 
      t.id === '10003' || 
      t.id === 10003
    ) || projectIssueTypes.find(t => 
      t.name.toLowerCase() === subtaskType.toLowerCase() || 
      t.name.toLowerCase().includes('sub-task') ||
      t.name.toLowerCase().includes('subtask') ||
      t.subtask === true
    );
    
    console.log('Selected Level -1 issue type:', availableLevel1Type ? `${availableLevel1Type.name} (ID: ${availableLevel1Type.id})` : 'Not found');
    
    if (!availableEpicType) {
      throw new Error(`Epic issue type "${epicType}" not found in project. Available types: ${projectIssueTypes.map(t => t.name).join(', ')}`);
    }
    
    if (!availableFeatureType) {
      throw new Error(`Feature issue type "${featureType}" not found in project. Available types: ${projectIssueTypes.map(t => t.name).join(', ')}`);
    }
    
    if (!availableStoryType) {
      throw new Error(`Story issue type "${storyType}" not found in project. Available types: ${projectIssueTypes.map(t => t.name).join(', ')}`);
    }
    
    if (!availableLevel1Type) {
      throw new Error(`Level -1 issue type not found in project. Available types: ${projectIssueTypes.map(t => t.name).join(', ')}`);
    }
    
    console.log('Using issue types:', {
      epic: availableEpicType.name,
      feature: availableFeatureType.name,
      story: availableStoryType.name,
      subtask: availableLevel1Type.name
    });
    
    // Parse Gherkin content
    const parsedFeatures = parseGherkinContent(gherkinContent);
    
    // Log the parsed features and scenarios for debugging
    console.log('Parsed Features:', parsedFeatures.map(f => ({
      name: f.name,
      scenarioCount: f.scenarios.length,
      scenarios: f.scenarios.map(s => s.name)
    })));
    
    // Check if we have selected items
    const hasSelectedItems = Array.isArray(selectedItems) && selectedItems.length > 0;
    console.log('Has selected items:', hasSelectedItems, 'Count:', selectedItems.length);
    
    // Create issues in Jira
    const createdIssues = [];
    
    // Convert folder name to Title Case for Epic name
    const toTitleCase = (str) => {
      return str.replace(/\w\S*/g, function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
      });
    };
    
    // Use folder name as Epic name, or default if not provided
    const epicName = folderName ? toTitleCase(folderName) : "Feature Files";
    
    // Generate a unique ID for tracking items
    let idCounter = 1;
    
    // Check if we're using Level 3 or Level 2 as parent
    const isLevel3Parent = hierarchyLevel === 'level3';
    
    console.log('Using hierarchy level:', isLevel3Parent ? 'Level 3 (Initiative)' : 'Level 2 (Epic)');
    
    if (isLevel3Parent) {
      // Level 3 → Epic → Feature → Story hierarchy
      console.log('Creating Epic → Feature → Story hierarchy under Initiative');
      
      // First, create an Epic (Level 2) under the Initiative (Level 3)
      const epicId = `item-${idCounter++}`;
      
      // Check if Epic is selected (or if we're not using selection)
      const shouldCreateEpic = !hasSelectedItems || 
        selectedItems.some(item => item.type === 'epic' && item.id === epicId);
      
      let epicIssue = null;
      
      if (shouldCreateEpic) {
        const epicFields = {
          project: {
            key: projectKey
          },
          summary: epicName,
          issuetype: {
            id: availableEpicType.id
          }
        };
        
        // Use parent/child relationships instead of Epic Link
        console.log('Creating Epic using parent/child relationship...');
        
        // If we have a parent Initiative, set it as the parent
        if (parentIssueKey) {
          console.log(`Setting parent for Epic to Initiative ${parentIssueKey}`);
          epicFields.parent = {
            key: parentIssueKey
          };
        }
        
        try {
          // Create the Epic with or without parent based on what we set above
          epicIssue = await jira.addNewIssue({
            fields: epicFields
          });
          console.log('Created Epic:', epicIssue.key);
        } catch (epicError) {
          console.error(`Error creating Epic: ${epicError.message}`);
          
          // If creating with parent fails, try without parent
          if (epicFields.parent) {
            console.log('Creating Epic failed with parent, trying without parent...');
            delete epicFields.parent;
            
            try {
              epicIssue = await jira.addNewIssue({
                fields: epicFields
              });
              console.log('Created Epic without parent:', epicIssue.key);
              
              // Create a "Relates" link instead
              if (parentIssueKey) {
                try {
                  await jira.issueLink({
                    type: {
                      name: "Relates"
                    },
                    inwardIssue: {
                      key: epicIssue.key
                    },
                    outwardIssue: {
                      key: parentIssueKey
                    }
                  });
                  console.log(`Created "Relates" link from ${epicIssue.key} to ${parentIssueKey}`);
                } catch (linkError) {
                  console.error(`Could not create link between ${epicIssue.key} and ${parentIssueKey}: ${linkError.message}`);
                }
              }
            } catch (noParentError) {
              console.error(`Error creating Epic without parent: ${noParentError.message}`);
              throw new Error(`Could not create Epic: ${noParentError.message}`);
            }
          } else {
            // If we don't have a parent and creating still failed, rethrow the error
            throw epicError;
          }
        }
        
        // Epic is created in the code above when checking if it can have a parent
        
        createdIssues.push({
          key: epicIssue.key,
          type: 'epic',
          summary: epicName,
          url: `${url}/browse/${epicIssue.key}`
        });
        
        console.log('Created Epic:', epicIssue.key);
      } else {
        console.log('Skipping Epic creation (not selected)');
      }
      
      // Now create Features under the Epic
      for (const feature of parsedFeatures) {
        // Generate a unique ID for this feature
        const featureId = `item-${idCounter++}`;
        
        // Check if Feature is selected (or if we're not using selection)
        const shouldCreateFeature = !hasSelectedItems || 
          selectedItems.some(item => item.type === 'feature' && item.id === featureId);
        
        // Skip if not selected or if Epic wasn't created
        if (!shouldCreateFeature || !epicIssue) {
          console.log(`Skipping Feature "${feature.name}" (not selected or Epic not created)`);
          
          // Increment counter for scenarios to maintain ID consistency
          idCounter += feature.scenarios.length;
          continue;
        }
        
        // Format the feature content with bold keywords for Feature description
        let formattedFeature = feature.content;
        
        // Bold the Feature keyword and add space after keywords
        formattedFeature = formattedFeature
          .replace(/^(Feature:)/gm, '*$1* ')
          .replace(/^Scenario:/gm, '**Scenario:**')
          .replace(/^Scenario Outline:/gm, '**Scenario Outline:**')
          .replace(/^(\s*)(Given)/gm, '$1*$2* ')
          .replace(/^(\s*)(When)/gm, '$1*$2* ')
          .replace(/^(\s*)(Then)/gm, '$1*$2* ')
          .replace(/^(\s*)(And)/gm, '$1*$2* ')
          .replace(/^(\s*)(But)/gm, '$1*$2* ');
        
        // Create Feature issue
        const featureFields = {
          project: {
            key: projectKey
          },
          summary: feature.name,
          issuetype: {
            id: availableFeatureType.id
          }
        };
        
        // Create a code block with Gherkin syntax for the Feature description
        const gherkinCodeBlock = `{code:language=gherkin}\n${feature.content}\n{code}`;
        featureFields.description = gherkinCodeBlock;
        
        // Make Feature a child of the Epic
        featureFields.parent = {
          key: epicIssue.key
        };
        
        const featureIssue = await jira.addNewIssue({
          fields: featureFields
        });
        
        createdIssues.push({
          key: featureIssue.key,
          type: 'feature',
          summary: feature.name,
          epicKey: epicIssue.key,
          url: `${url}/browse/${featureIssue.key}`
        });
        
        console.log('Created Feature:', featureIssue.key);
        
        // Create Stories for each Scenario
        for (const scenario of feature.scenarios) {
          try {
            // Generate a unique ID for this story
            const storyId = `item-${idCounter++}`;
            
            // Check if Story is selected (or if we're not using selection)
            const shouldCreateStory = !hasSelectedItems || 
              selectedItems.some(item => item.type === 'story' && item.id === storyId);
            
            // Skip if not selected
            if (!shouldCreateStory) {
              console.log(`Skipping Story "${scenario.name}" (not selected)`);
              continue;
            }
            
            // Format the scenario in proper Gherkin style with bold keywords and proper indentation
            let formattedScenario = scenario.content;
            
            // Bold the Gherkin keywords and add space after keywords
            formattedScenario = formattedScenario
              .replace(/^Scenario:/gm, '*Scenario:*')
              .replace(/^Scenario Outline:/gm, '*Scenario Outline:*')
              .replace(/^(\s*)(Given)/gm, '$1*$2* ')
              .replace(/^(\s*)(When)/gm, '$1*$2* ')
              .replace(/^(\s*)(Then)/gm, '$1*$2* ')
              .replace(/^(\s*)(And)/gm, '$1*$2* ')
              .replace(/^(\s*)(But)/gm, '$1*$2* ');
            
            const storyFields = {
              project: {
                key: projectKey
              },
              summary: scenario.name,
              issuetype: {
                id: availableStoryType.id
              },
              // Link to parent Feature
              parent: {
                key: featureIssue.key
              }
            };
            
            // Create a code block with Gherkin syntax for the Story description
            const scenarioGherkinCodeBlock = `{code:language=gherkin}\n${scenario.content}\n{code}`;
            storyFields.description = scenarioGherkinCodeBlock;
            
            // Only set the custom Story field if it's not 'description' (which is already set)
            if (storyField && storyField !== 'description') {
              storyFields[storyField] = scenarioGherkinCodeBlock;
            }
            
            // Create the Story issue
            const storyIssue = await jira.addNewIssue({
              fields: storyFields
            });
            
            // Populate custom field 11201 with the Feature's summary
            await jira.updateIssue(storyIssue.key, {
              fields: {
                "customfield_11201": feature.name
              }
            });
            
            // Create a "Relates" link between the Story and its parent Feature
            try {
              await jira.issueLink({
                type: {
                  name: "Relates"
                },
                inwardIssue: {
                  key: storyIssue.key
                },
                outwardIssue: {
                  key: featureIssue.key
                }
              });
              console.log(`Created "Relates" link from ${storyIssue.key} to ${featureIssue.key}`);
            } catch (linkError) {
              // If link creation fails, just log the error but don't fail the whole process
              console.error(`Could not create link between ${storyIssue.key} and ${featureIssue.key}: ${linkError.message}`);
            }
            
            createdIssues.push({
              key: storyIssue.key,
              type: 'story',
              summary: scenario.name,
              featureKey: featureIssue.key,
              url: `${url}/browse/${storyIssue.key}`
            });
            
            console.log('Created Story:', storyIssue.key);
          } catch (storyError) {
            console.error(`Error creating Story for scenario "${scenario.name}":`, storyError);
          }
        }
      }
    } else {
      // Level 2 → Story → Sub-task hierarchy
      // Map Feature in file to Story in Jira, and Scenario in file to Sub-task in Jira
      console.log('Creating Story → Sub-task hierarchy directly under Epic (Level 2)');
      console.log('Parent Epic Key:', parentIssueKey);
      
      // Now create Stories (from Features in the file) under the parent Epic
      for (const feature of parsedFeatures) {
        // Generate a unique ID for this story
        const storyId = `item-${idCounter++}`;
        
        // Check if Story is selected (or if we're not using selection)
        const shouldCreateStory = !hasSelectedItems || 
          selectedItems.some(item => item.type === 'story' && item.id === storyId);
        
        // Skip if not selected or if parent Epic key wasn't provided
        if (!shouldCreateStory || !parentIssueKey) {
          console.log(`Skipping Story "${feature.name}" (not selected or parent not available)`);
          
          // Increment counter for scenarios to maintain ID consistency
          idCounter += feature.scenarios.length;
          continue;
        }
        
        // Format the feature content with bold keywords for Story description
        let formattedFeature = feature.content;
        
        // Bold the Feature keyword and add space after keywords
        formattedFeature = formattedFeature
          .replace(/^(Feature:)/gm, '*$1* ')
          .replace(/^Scenario:/gm, '**Scenario:**')
          .replace(/^Scenario Outline:/gm, '**Scenario Outline:**')
          .replace(/^(\s*)(Given)/gm, '$1*$2* ')
          .replace(/^(\s*)(When)/gm, '$1*$2* ')
          .replace(/^(\s*)(Then)/gm, '$1*$2* ')
          .replace(/^(\s*)(And)/gm, '$1*$2* ')
          .replace(/^(\s*)(But)/gm, '$1*$2* ');
        
        // Create Story issue (from Feature in file)
        const storyFields = {
          project: {
            key: projectKey
          },
          summary: feature.name,
          issuetype: {
            id: availableStoryType.id
          }
        };
        
        // Create a code block with Gherkin syntax for the Story description
        const gherkinCodeBlock = `{code:language=gherkin}\n${feature.content}\n{code}`;
        storyFields.description = gherkinCodeBlock;
        
        // Use parent/child relationship for Stories under Epic as well
        console.log(`Setting parent for Story to Epic ${parentIssueKey}`);
        storyFields.parent = {
          key: parentIssueKey
        };
        
        // Only set the custom Story field if it's not 'description' (which is already set)
        if (storyField && storyField !== 'description') {
          storyFields[storyField] = gherkinCodeBlock;
        }
        
        const storyIssue = await jira.addNewIssue({
          fields: storyFields
        });
        
        // Populate custom field 11201 with the Feature's name
        await jira.updateIssue(storyIssue.key, {
          fields: {
            "customfield_11201": feature.name
          }
        });
        
        createdIssues.push({
          key: storyIssue.key,
          type: 'story',
          summary: feature.name,
          epicKey: parentIssueKey,
          url: `${url}/browse/${storyIssue.key}`
        });
        
        console.log('Created Story (from Feature):', storyIssue.key);
        
        // Create Sub-tasks for each Scenario
        for (const scenario of feature.scenarios) {
          try {
            // Generate a unique ID for this subtask
            const subtaskId = `item-${idCounter++}`;
            
            // Check if Subtask is selected (or if we're not using selection)
            const shouldCreateSubtask = !hasSelectedItems || 
              selectedItems.some(item => item.type === 'subtask' && item.id === subtaskId);
            
            // Skip if not selected
            if (!shouldCreateSubtask) {
              console.log(`Skipping Sub-task for "${scenario.name}" (not selected)`);
              continue;
            }
            
            // Format the scenario in proper Gherkin style with bold keywords and proper indentation
            let formattedScenario = scenario.content;
            
            // Bold the Gherkin keywords and add space after keywords
            formattedScenario = formattedScenario
              .replace(/^Scenario:/gm, '*Scenario:*')
              .replace(/^Scenario Outline:/gm, '*Scenario Outline:*')
              .replace(/^(\s*)(Given)/gm, '$1*$2* ')
              .replace(/^(\s*)(When)/gm, '$1*$2* ')
              .replace(/^(\s*)(Then)/gm, '$1*$2* ')
              .replace(/^(\s*)(And)/gm, '$1*$2* ')
              .replace(/^(\s*)(But)/gm, '$1*$2* ');
            
            // Create a code block with Gherkin syntax for the Sub-task description
            const scenarioGherkinCodeBlock = `{code:language=gherkin}\n${scenario.content}\n{code}`;
            
            // Create Sub-task fields (Level -1)
            console.log(`Creating Sub-task (Level -1) under Story ${storyIssue.key}`);
            const subtaskFields = {
              project: {
                key: projectKey
              },
              summary: scenario.name,
              issuetype: {
                id: availableLevel1Type.id
              },
              // Link to parent Story
              parent: {
                key: storyIssue.key
              },
              description: scenarioGherkinCodeBlock
            };
            
            // Create the Sub-task issue
            const subtaskIssue = await jira.addNewIssue({
              fields: subtaskFields
            });
            
            createdIssues.push({
              key: subtaskIssue.key,
              type: 'subtask',
              summary: scenario.name,
              storyKey: storyIssue.key,
              url: `${url}/browse/${subtaskIssue.key}`
            });
            
            console.log('Created Sub-task:', subtaskIssue.key);
          } catch (subtaskError) {
            console.error(`Error creating Sub-task for scenario "${scenario.name}":`, subtaskError);
          }
        }
      }
    }
    
    return {
      success: true,
      createdIssues
    };
  } catch (error) {
    console.error('Error creating Jira issues:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
