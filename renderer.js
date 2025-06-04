// DOM Elements
const selectFolderBtn = document.getElementById('select-folder-btn');
const selectedFileDiv = document.getElementById('selected-file');
const folderNameSpan = document.getElementById('folder-name');
const folderFilesDiv = document.getElementById('folder-files');
const fileListDiv = document.getElementById('file-list');
const featureFilesCountP = document.getElementById('feature-files-count');
const processBtn = document.getElementById('process-btn');
const resultSection = document.getElementById('result-section');
const gherkinOutput = document.getElementById('gherkin-output');
const saveBtn = document.getElementById('save-btn');
const jiraBtn = document.getElementById('jira-btn');
const jiraSection = document.getElementById('jira-section');
const jiraUrlInput = document.getElementById('jira-url');
const jiraUsernameInput = document.getElementById('jira-username');
const jiraApiTokenInput = document.getElementById('jira-api-token');
const saveCredentialsBtn = document.getElementById('save-credentials-btn');
const clearCredentialsBtn = document.getElementById('clear-credentials-btn');
const jiraProjectSelect = document.getElementById('jira-project');
const jiraParentSelect = document.getElementById('jira-parent');
const testJiraBtn = document.getElementById('test-jira-btn');
const loadJiraDataBtn = document.getElementById('load-jira-data-btn');
const jiraDataSection = document.getElementById('jira-data-section');
const createJiraBtn = document.getElementById('create-jira-btn');
const jiraResult = document.getElementById('jira-result');
const jiraResultContent = document.getElementById('jira-result-content');
const loadingDiv = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const statusMessage = document.getElementById('status-message');

// State variables
let selectedFolderPath = null;
let gherkinContent = null;
let selectedFolderName = null;

// Helper functions
function showLoading(message) {
  loadingText.textContent = message;
  loadingDiv.classList.remove('hidden');
}

function hideLoading() {
  loadingDiv.classList.add('hidden');
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.remove('hidden');
  statusMessage.classList.toggle('error', isError);
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 5000);
}

function validateInputs() {
  processBtn.disabled = !selectedFolderPath;
}

// Event listeners
selectFolderBtn.addEventListener('click', async () => {
  try {
    const result = await window.api.selectFeatureFolder();
    
    if (result.success) {
      selectedFolderPath = result.folderPath;
      selectedFolderName = result.folderName;
      folderNameSpan.textContent = result.folderName;
      selectedFileDiv.classList.remove('hidden');
      
      // Display files in the folder
      if (result.files && result.files.length > 0) {
        displayFolderFiles(result.files, result.featureFilesCount);
      } else {
        // Hide file list if no files
        folderFilesDiv.classList.add('hidden');
        if (result.error) {
          showStatus(`Error reading folder contents: ${result.error}`, true);
        }
      }
      
      validateInputs();
    }
  } catch (error) {
    showStatus(`Error selecting folder: ${error.message}`, true);
  }
});

// Function to display files in the selected folder
function displayFolderFiles(files, featureFilesCount) {
  // Clear previous file list
  fileListDiv.innerHTML = '';
  
  // Sort files: directories first, then feature files, then other files
  const sortedFiles = [...files].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    if (a.isFeatureFile && !b.isFeatureFile) return -1;
    if (!a.isFeatureFile && b.isFeatureFile) return 1;
    return a.name.localeCompare(b.name);
  });
  
  // Add each file to the list
  sortedFiles.forEach(file => {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    if (file.isFeatureFile) {
      fileItem.classList.add('feature-file');
    }
    
    const icon = document.createElement('span');
    icon.className = 'file-item-icon';
    icon.textContent = file.isDirectory ? '📁' : (file.isFeatureFile ? '📄' : '📄');
    
    const name = document.createElement('span');
    name.textContent = file.name;
    
    fileItem.appendChild(icon);
    fileItem.appendChild(name);
    fileListDiv.appendChild(fileItem);
  });
  
  // Show feature files count
  if (featureFilesCount > 0) {
    featureFilesCountP.textContent = `Found ${featureFilesCount} feature file${featureFilesCount !== 1 ? 's' : ''} in this folder.`;
  } else {
    featureFilesCountP.textContent = 'No feature files found in this folder.';
  }
  
  // Show the file list section
  folderFilesDiv.classList.remove('hidden');
}

// Initialize when the page loads
window.addEventListener('DOMContentLoaded', async () => {
  validateInputs();
});

processBtn.addEventListener('click', async () => {
  if (!selectedFolderPath) {
    showStatus('Please select a folder with feature files first', true);
    return;
  }
  
  try {
    showLoading('Processing feature files...');
    
    const result = await window.api.processFeatureFolder(selectedFolderPath);
    
    hideLoading();
    
    if (result.success) {
      gherkinContent = result.gherkinContent;
      selectedFolderName = result.folderName;
      gherkinOutput.textContent = gherkinContent;
      resultSection.classList.remove('hidden');
      showStatus(`Successfully processed ${result.featureFiles.length} feature files!`);
    } else {
      showStatus(`Error processing feature files: ${result.error}`, true);
    }
  } catch (error) {
    hideLoading();
    showStatus(`Error processing feature files: ${error.message}`, true);
  }
});

saveBtn.addEventListener('click', async () => {
  if (!gherkinContent) {
    showStatus('No Gherkin content to save', true);
    return;
  }
  
  try {
    showLoading('Saving feature files...');
    
    const result = await window.api.saveFeatureFiles(gherkinContent);
    
    hideLoading();
    
    if (result.success) {
      const fileCount = result.savedFiles.length;
      showStatus(`Successfully saved ${fileCount} feature file${fileCount !== 1 ? 's' : ''}!`);
    } else {
      showStatus('Saving was cancelled or failed', true);
    }
  } catch (error) {
    hideLoading();
    showStatus(`Error saving feature files: ${error.message}`, true);
  }
});

// Show Jira integration section
jiraBtn.addEventListener('click', async () => {
  if (!gherkinContent) {
    showStatus('No Gherkin content to push to Jira', true);
    return;
  }
  
  jiraSection.classList.remove('hidden');
  jiraResult.classList.add('hidden');
  
  // Load saved credentials if available
  try {
    const result = await window.api.loadJiraCredentials();
    if (result.success && result.credentials) {
      jiraUrlInput.value = result.credentials.url || '';
      jiraUsernameInput.value = result.credentials.username || '';
      jiraApiTokenInput.value = result.credentials.apiToken || '';
    }
  } catch (error) {
    console.error('Error loading credentials:', error);
  }
  
  // Scroll to Jira section
  jiraSection.scrollIntoView({ behavior: 'smooth' });
});

// Save Jira credentials
saveCredentialsBtn.addEventListener('click', async () => {
  const credentials = {
    url: jiraUrlInput.value.trim(),
    username: jiraUsernameInput.value.trim(),
    apiToken: jiraApiTokenInput.value.trim()
  };
  
  if (!validateJiraConfig(credentials, ['url', 'username', 'apiToken'])) {
    return;
  }
  
  try {
    const result = await window.api.saveJiraCredentials(credentials);
    if (result.success) {
      showStatus('Credentials saved successfully!');
    } else {
      showStatus('Failed to save credentials', true);
    }
  } catch (error) {
    showStatus(`Error saving credentials: ${error.message}`, true);
  }
});

// Clear Jira credentials
clearCredentialsBtn.addEventListener('click', async () => {
  try {
    const result = await window.api.clearJiraCredentials();
    if (result.success) {
      jiraUrlInput.value = '';
      jiraUsernameInput.value = '';
      jiraApiTokenInput.value = '';
      showStatus('Credentials cleared successfully!');
    } else {
      showStatus('Failed to clear credentials', true);
    }
  } catch (error) {
    showStatus(`Error clearing credentials: ${error.message}`, true);
  }
});

// Test Jira connection
testJiraBtn.addEventListener('click', async () => {
  const jiraConfig = getJiraConfig();
  
  if (!validateJiraConfig(jiraConfig, ['url', 'username', 'apiToken'])) {
    return;
  }
  
  try {
    showLoading('Testing Jira connection...');
    
    const result = await window.api.testJiraConnection(jiraConfig);
    
    hideLoading();
    
    if (result.success) {
      showStatus(`Successfully connected to Jira as ${result.user.displayName}!`);
      loadJiraDataBtn.disabled = false;
    } else {
      showStatus(`Error connecting to Jira: ${result.error}`, true);
      loadJiraDataBtn.disabled = true;
    }
  } catch (error) {
    hideLoading();
    showStatus(`Error connecting to Jira: ${error.message}`, true);
    loadJiraDataBtn.disabled = true;
  }
});

// Load Jira data
loadJiraDataBtn.addEventListener('click', async () => {
  const jiraConfig = getJiraConfig();
  
  if (!validateJiraConfig(jiraConfig, ['url', 'username', 'apiToken'])) {
    return;
  }
  
  try {
    showLoading('Loading Jira data...');
    
    // Load projects
    const projectsResult = await window.api.getJiraProjects(jiraConfig);
    if (!projectsResult.success) {
      throw new Error(projectsResult.error || 'Failed to load Jira projects');
    }
    
    // Load issue types
    const issueTypesResult = await window.api.getJiraIssueTypes(jiraConfig);
    if (!issueTypesResult.success) {
      throw new Error(issueTypesResult.error || 'Failed to load Jira issue types');
    }
    
    // Populate dropdowns
    populateProjectsDropdown(projectsResult.projects);
    
    // Show the data section
    jiraDataSection.classList.remove('hidden');
    
    hideLoading();
    showStatus('Jira data loaded successfully!');
  } catch (error) {
    hideLoading();
    showStatus(`Error loading Jira data: ${error.message}`, true);
  }
});

// Helper function to populate projects dropdown
function populateProjectsDropdown(projects) {
  // Clear existing options except the first one
  jiraProjectSelect.innerHTML = '<option value="">Select a project</option>';
  
  // Add projects
  projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.key;
    option.textContent = `${project.name} (${project.key})`;
    jiraProjectSelect.appendChild(option);
  });
  
  // Remove any existing event listeners
  jiraProjectSelect.removeEventListener('change', handleProjectChange);
  
  // Add event listener to load project-specific data when project is selected
  jiraProjectSelect.addEventListener('change', handleProjectChange);
}

// Handle project selection change
async function handleProjectChange() {
  const projectKey = jiraProjectSelect.value;
  
  if (!projectKey) {
    // Clear dropdowns if no project selected
    jiraParentSelect.innerHTML = '<option value="">None</option>';
    return;
  }
  
  try {
    showLoading('Loading project data...');
    
    const jiraConfig = getJiraConfig();
    
    // Load issues for parent selection
    await loadProjectIssues(projectKey);
    
    hideLoading();
  } catch (error) {
    hideLoading();
    showStatus(`Error loading project data: ${error.message}`, true);
  }
}

// Helper function to load issues for a project
async function loadProjectIssues(projectKey) {
  try {
    showLoading('Loading Initiatives...');
    
    const jiraConfig = getJiraConfig();
    const result = await window.api.searchJiraIssues(jiraConfig, projectKey);
    
    hideLoading();
    
    if (result.success) {
      // Clear existing options
      jiraParentSelect.innerHTML = '<option value="">None</option>';
      
      // Add issues
      result.issues.forEach(issue => {
        const option = document.createElement('option');
        option.value = issue.key;
        option.textContent = `${issue.key}: ${issue.summary} (${issue.issueType})`;
        jiraParentSelect.appendChild(option);
      });
    } else {
      showStatus(`Error loading project issues: ${result.error}`, true);
    }
  } catch (error) {
    hideLoading();
    showStatus(`Error loading project issues: ${error.message}`, true);
  }
}

// Create Jira issues
createJiraBtn.addEventListener('click', async () => {
  if (!gherkinContent) {
    showStatus('No Gherkin content to push to Jira', true);
    return;
  }
  
  const jiraConfig = getJiraConfig();
  
  if (!validateJiraConfig(jiraConfig, ['url', 'username', 'apiToken', 'projectKey'])) {
    return;
  }
  
  try {
    showLoading('Creating Jira issues...');
    
    const result = await window.api.createJiraIssues(gherkinContent, { ...jiraConfig, folderName: selectedFolderName });
    
    hideLoading();
    
    if (result.success) {
      displayJiraResults(result.createdIssues, jiraConfig.url);
      showStatus(`Successfully created ${result.createdIssues.length} Jira issues!`);
    } else {
      showStatus(`Error creating Jira issues: ${result.error}`, true);
    }
  } catch (error) {
    hideLoading();
    showStatus(`Error creating Jira issues: ${error.message}`, true);
  }
});

// Helper function to get Jira configuration from form
function getJiraConfig() {
  return {
    url: jiraUrlInput.value.trim(),
    username: jiraUsernameInput.value.trim(),
    apiToken: jiraApiTokenInput.value.trim(),
    projectKey: jiraProjectSelect.value.trim(),
    parentIssueKey: jiraParentSelect.value.trim(),
    epicNameField: '', // No Epic Name field
    epicLinkField: '', // No Epic Link field
    storyField: 'customfield_10577', // Use custom field 10577 for Scenario content
    epicType: 'Epic', // Default Epic type
    featureType: 'Feature', // Default Feature type
    storyType: 'Story' // Default Story type
  };
}

// Helper function to validate Jira configuration
function validateJiraConfig(config, requiredFields) {
  for (const field of requiredFields) {
    if (!config[field]) {
      showStatus(`Please enter a valid Jira ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`, true);
      return false;
    }
  }
  
  // Validate URL format
  if (config.url && !config.url.match(/^https?:\/\/.+/)) {
    showStatus('Please enter a valid Jira URL (including http:// or https://)', true);
    return false;
  }
  
  return true;
}

// Helper function to display Jira results
function displayJiraResults(issues, jiraUrl) {
  jiraResult.classList.remove('hidden');
  jiraResultContent.innerHTML = '';
  
  // Group issues by type
  const epics = issues.filter(issue => issue.type === 'epic');
  const features = issues.filter(issue => issue.type === 'feature');
  const stories = issues.filter(issue => issue.type === 'story');
  
  // Create HTML for each issue
  for (const epic of epics) {
    const epicElement = document.createElement('div');
    epicElement.className = 'jira-item epic';
    epicElement.innerHTML = `
      <div class="jira-item-title">
        <span class="jira-item-key">${epic.key}</span>: ${epic.summary} (Epic)
      </div>
      <a href="${epic.url}" class="jira-item-link" target="_blank">View in Jira</a>
    `;
    jiraResultContent.appendChild(epicElement);
    
    // Add related features
    const epicFeatures = features.filter(feature => feature.epicKey === epic.key);
    for (const feature of epicFeatures) {
      const featureElement = document.createElement('div');
      featureElement.className = 'jira-item feature';
      featureElement.style.marginLeft = '20px';
      featureElement.innerHTML = `
        <div class="jira-item-title">
          <span class="jira-item-key">${feature.key}</span>: ${feature.summary} (Feature)
        </div>
        <a href="${feature.url}" class="jira-item-link" target="_blank">View in Jira</a>
      `;
      jiraResultContent.appendChild(featureElement);
      
      // Add related stories
      const featureStories = stories.filter(story => story.featureKey === feature.key);
      for (const story of featureStories) {
        const storyElement = document.createElement('div');
        storyElement.className = 'jira-item story';
        storyElement.style.marginLeft = '40px';
        storyElement.innerHTML = `
          <div class="jira-item-title">
            <span class="jira-item-key">${story.key}</span>: ${story.summary} (Scenario)
          </div>
          <a href="${story.url}" class="jira-item-link" target="_blank">View in Jira</a>
        `;
        jiraResultContent.appendChild(storyElement);
      }
    }
  }
  
  // Scroll to results
  jiraResult.scrollIntoView({ behavior: 'smooth' });
}
