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
  
  return { 
    success: true, 
    folderPath: filePaths[0],
    folderName: path.basename(filePaths[0])
  };
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
    
    // Filter for custom fields
    const customFields = fields.filter(field => field.custom);
    
    return {
      success: true,
      fields: customFields.map(field => ({
        id: field.id,
        name: field.name,
        custom: field.custom,
        schema: field.schema
      }))
    };
  } catch (error) {
    console.error('Error getting Jira fields:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Search Jira issues
ipcMain.handle('search-jira-issues', async (event, { jiraConfig, projectKey }) => {
  try {
    // Create Jira client
    const jira = createJiraClient(jiraConfig);
    
    console.log(`Searching for Level 3 Initiatives in project ${projectKey}`);
    
    // Get all issue types to understand what's available
    const issueTypes = await jira.listIssueTypes();
    console.log('Available issue types:', issueTypes.map(t => t.name));
    
    // Try multiple approaches to find Level 3 initiatives
    
    // First try: Search for any high-level issues in the project
    try {
      // Get all issues in the project to see what's available
      const allIssuesResult = await jira.searchJira(`project = ${projectKey} ORDER BY created DESC`, {
        maxResults: 100,
        fields: ['key', 'summary', 'issuetype', 'parent']
      });
      
      console.log(`Found ${allIssuesResult.issues ? allIssuesResult.issues.length : 0} total issues in project`);
      
      if (allIssuesResult.issues && allIssuesResult.issues.length > 0) {
        // Look for any issues that might be Level 3 initiatives
        const potentialL3Issues = allIssuesResult.issues.filter(issue => {
          const summary = issue.fields.summary.toLowerCase();
          const issueType = issue.fields.issuetype.name.toLowerCase();
          
          // Check if this looks like a high-level issue
          return (
            issueType.includes('initiative') ||
            issueType.includes('theme') ||
            issueType.includes('epic') ||
            issueType.includes('program') ||
            summary.includes('initiative') ||
            summary.includes('level 3') ||
            summary.includes('l3') ||
            // If it has no parent, it might be a top-level issue
            !issue.fields.parent
          );
        });
        
        console.log(`Found ${potentialL3Issues.length} potential Level 3 issues`);
        
        if (potentialL3Issues.length > 0) {
          return {
            success: true,
            issues: potentialL3Issues.map(issue => ({
              id: issue.id,
              key: issue.key,
              summary: issue.fields.summary + " (Level 3)",
              issueType: issue.fields.issuetype.name
            }))
          };
        }
      }
    } catch (error) {
      console.log('General search failed:', error.message);
    }
    
    // Second try: Just return all issues as a last resort
    try {
      const result = await jira.searchJira(`project = ${projectKey} ORDER BY created DESC`, {
        maxResults: 20,
        fields: ['key', 'summary', 'issuetype']
      });
      
      if (result.issues && result.issues.length > 0) {
        console.log('Returning all issues as Level 3 candidates');
        return {
          success: true,
          issues: result.issues.map(issue => ({
            id: issue.id,
            key: issue.key,
            summary: issue.fields.summary + " (Level 3 Candidate)",
            issueType: issue.fields.issuetype.name
          }))
        };
      }
    } catch (error) {
      console.log('Fallback search failed:', error.message);
    }
    
    // Return empty list if nothing found
    console.log('No issues found, returning empty list');
    return {
      success: true,
      issues: []
    };
  } catch (error) {
    // If the search fails, try a fallback search
    try {
      const jira = createJiraClient(jiraConfig);
      
      // Get all issue types to find the Epic type or similar
      const issueTypes = await jira.listIssueTypes();
      
      // Look for any issue types that might be high-level (Level 3)
      const highLevelTypes = issueTypes
        .filter(type => 
          type.name.includes('Initiative') || 
          type.name.includes('Theme') ||
          type.name.includes('Program') ||
          type.name.includes('Epic') ||
          type.name.includes('Level') ||
          !type.subtask // Non-subtask types could be high-level
        )
        .map(type => type.name);
      
      console.log('Potential high-level issue types:', highLevelTypes);
      
      // If no specific high-level types found, return all issue types
      if (highLevelTypes.length === 0) {
        console.log('No high-level types found, using all issue types');
        return {
          success: true,
          issues: []
        };
      }
      
      // If we found high-level types, search for them
      if (highLevelTypes.length > 0) {
        const typeClause = highLevelTypes
          .map(type => `issuetype = "${type}"`)
          .join(' OR ');
        
        const result = await jira.searchJira(`project = ${projectKey} AND (${typeClause}) ORDER BY created DESC`, {
          maxResults: 100,
          fields: ['key', 'summary', 'issuetype']
        });
        
        // Filter the results to only include issues that are likely Level 3 initiatives
        const filteredIssues = result.issues.filter(issue => {
          const summary = issue.fields.summary.toLowerCase();
          const issueType = issue.fields.issuetype.name.toLowerCase();
          
          return (
            issueType.includes('initiative') ||
            issueType.includes('theme') ||
            issueType.includes('program') ||
            summary.includes('level 3') ||
            summary.includes('l3') ||
            summary.includes('initiative')
          );
        });
        
        return {
          success: true,
          issues: filteredIssues.map(issue => ({
            id: issue.id,
            key: issue.key,
            summary: issue.fields.summary + " (Level 3)",
            issueType: issue.fields.issuetype.name
          }))
        };
      } else {
        // If no high-level types found, just return an empty list
        return {
          success: true,
          issues: []
        };
      }
    } catch (fallbackError) {
      console.error('Error in fallback search:', fallbackError);
      return {
        success: false,
        error: error.message
      };
    }
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
ipcMain.handle('create-jira-issues', async (event, { gherkinContent, jiraConfig, folderName }) => {
  try {
    const { 
      url, 
      username, 
      apiToken, 
      projectKey, 
      parentIssueKey, // This is now the Initiative key (Level 3)
      epicNameField = 'customfield_10011',
      epicLinkField = 'customfield_10010',
      storyField = 'customfield_10577', // Custom field for Story scenario content
      epicType = 'Epic', // Level 2
      featureType = 'Feature', // Level 1
      storyType = 'Story' // Level 0
    } = jiraConfig;
    
    console.log('Creating Jira issues with config:', {
      url,
      username: username ? '(provided)' : '(missing)',
      apiToken: apiToken ? '(provided)' : '(missing)',
      projectKey,
      parentIssueKey,
      epicNameField,
      epicLinkField,
      epicType,
      featureType,
      storyType
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
    
    // Use the specified Epic Work Type ID 10472
    const availableEpicType = {
      id: '10472',
      name: 'Level 2 Epic'
    };
    
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
    
    if (!availableEpicType) {
      throw new Error(`Epic issue type "${epicType}" not found in project. Available types: ${projectIssueTypes.map(t => t.name).join(', ')}`);
    }
    
    if (!availableFeatureType) {
      throw new Error(`Feature issue type "${featureType}" not found in project. Available types: ${projectIssueTypes.map(t => t.name).join(', ')}`);
    }
    
    if (!availableStoryType) {
      throw new Error(`Story issue type "${storyType}" not found in project. Available types: ${projectIssueTypes.map(t => t.name).join(', ')}`);
    }
    
    console.log('Using issue types:', {
      epic: availableEpicType.name,
      feature: availableFeatureType.name,
      story: availableStoryType.name
    });
    
    // Parse Gherkin content
    const parsedFeatures = parseGherkinContent(gherkinContent);
    
    // Log the parsed features and scenarios for debugging
    console.log('Parsed Features:', parsedFeatures.map(f => ({
      name: f.name,
      scenarioCount: f.scenarios.length,
      scenarios: f.scenarios.map(s => s.name)
    })));
    
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
    
    // First, create an Epic (Level 2) under the Initiative (Level 3)
    const epicFields = {
      project: {
        key: projectKey
      },
      summary: epicName,
      issuetype: {
        id: availableEpicType.id
      }
    };
    
    // Don't set Epic Name field as requested by user
    // The field will be set automatically by Jira if needed
    
    // Link to parent Initiative if specified
    if (parentIssueKey) {
      epicFields.parent = {
        key: parentIssueKey
      };
    }
    
    // Create the Epic
    const epicIssue = await jira.addNewIssue({
      fields: epicFields
    });
    
      createdIssues.push({
        key: epicIssue.key,
        type: 'epic',
        summary: epicName,
        url: `${url}/browse/${epicIssue.key}`
      });
    
    // Now create Features under the Epic
    for (const feature of parsedFeatures) {
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
      
      // Create Stories for each Scenario
      for (const scenario of feature.scenarios) {
        try {
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
          
          const storyIssue = await jira.addNewIssue({
            fields: storyFields
          });
          
          createdIssues.push({
            key: storyIssue.key,
            type: 'story',
            summary: scenario.name,
            featureKey: featureIssue.key,
            url: `${url}/browse/${storyIssue.key}`
          });
        } catch (storyError) {
          console.error(`Error creating Story for scenario "${scenario.name}":`, storyError);
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
