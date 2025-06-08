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
const parentLevelLabel = document.getElementById('parent-level-label');
const hierarchyHint = document.getElementById('hierarchy-hint');
const level3Radio = document.getElementById('level3-radio');
const level2Radio = document.getElementById('level2-radio');
const testJiraBtn = document.getElementById('test-jira-btn');
const loadJiraDataBtn = document.getElementById('load-jira-data-btn');
const jiraDataSection = document.getElementById('jira-data-section');
const jiraPreviewSection = document.getElementById('jira-preview-section');
const jiraPreviewContent = document.getElementById('jira-preview-content');
const selectAllBtn = document.getElementById('select-all-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');
const previewJiraBtn = document.getElementById('preview-jira-btn');
const createJiraBtn = document.getElementById('create-jira-btn');
const jiraResult = document.getElementById('jira-result');
const jiraResultContent = document.getElementById('jira-result-content');
const loadingDiv = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const statusMessage = document.getElementById('status-message');

// Target Content Fields DOM Elements
const targetContentFieldsSection = document.getElementById('target-content-fields');
const featureFieldSection = document.getElementById('feature-field-section');
const storyFieldSection = document.getElementById('story-field-section');
const subtaskFieldSection = document.getElementById('subtask-field-section');
const featureContentField = document.getElementById('feature-content-field');
const storyContentField = document.getElementById('story-content-field');
const subtaskContentField = document.getElementById('subtask-content-field');

// State variables
let selectedFolderPath = null;
let gherkinContent = null;
let selectedFolderName = null;
let previewedJiraItems = []; // Store the previewed Jira items

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
  
  // Add event listeners for hierarchy level radio buttons
  level3Radio.addEventListener('change', updateHierarchyLabels);
  level2Radio.addEventListener('change', updateHierarchyLabels);
  
  // Initialize hierarchy labels
  updateHierarchyLabels();
});

// Update labels and hints based on selected hierarchy level
function updateHierarchyLabels() {
  const isLevel3 = level3Radio.checked;
  
  if (isLevel3) {
    parentLevelLabel.textContent = 'Parent Initiative (Level 3)';
    hierarchyHint.textContent = 'The Epic (Level 2) will be created under the selected Initiative, with Features and Stories under the Epic';
    showLoading('Loading Level 3 items...');
    
    // Show Feature field section, hide Subtask field section
    featureFieldSection.classList.remove('hidden');
    subtaskFieldSection.classList.add('hidden');
  } else {
    parentLevelLabel.textContent = 'Parent Epic (Level 2)';
    hierarchyHint.textContent = 'Features from file will be created as Stories under the selected Epic, with Scenarios created as Sub-tasks';
    showLoading('Loading Level 2 items...');
    
    // Hide Feature field section, show Subtask field section
    featureFieldSection.classList.add('hidden');
    subtaskFieldSection.classList.remove('hidden');
  }
  
  // Story field section is always visible
  storyFieldSection.classList.remove('hidden');
  
  // Reload parent items if a project is selected
  const projectKey = jiraProjectSelect.value;
  if (projectKey) {
    loadProjectIssues(projectKey).then(() => {
      hideLoading();
      
      // Load custom fields for the selected project
      loadCustomFields(projectKey);
    }).catch(error => {
      hideLoading();
      showStatus(`Error loading parent items: ${error.message}`, true);
    });
  } else {
    hideLoading();
  }
}

// Function to load custom fields for a project
async function loadCustomFields(projectKey) {
  try {
    showLoading('Loading custom fields...');
    
    const jiraConfig = getJiraConfig();
    
    console.log('Loading custom fields for project:', projectKey);
    
    // Get all custom fields
    const fieldsResult = await window.api.getJiraFields(jiraConfig);
    
    console.log('Fields result:', fieldsResult);
    
    if (!fieldsResult.success) {
      throw new Error(fieldsResult.error || 'Failed to load Jira fields');
    }
    
    console.log('Available fields:', fieldsResult.fields);
    
    // Filter for paragraph fields (text fields that can store Gherkin content)
    const paragraphFields = fieldsResult.fields.filter(field => 
      field.schema && 
      (field.schema.type === 'string' || field.schema.type === 'text')
    );
    
    console.log('Paragraph fields:', paragraphFields);
    
    // Populate the field dropdowns
    populateFieldDropdowns(paragraphFields);
    
    hideLoading();
  } catch (error) {
    console.error('Error loading custom fields:', error);
    hideLoading();
    showStatus(`Error loading custom fields: ${error.message}`, true);
  }
}

// Function to populate field dropdowns
function populateFieldDropdowns(fields) {
  // Helper function to populate a single dropdown
  const populateDropdown = (dropdown, selectedValue = 'description') => {
    // Save the current selection if it exists
    const currentValue = dropdown.value;
    
    // Clear existing options except the first one (Description)
    dropdown.innerHTML = '<option value="description">Description (Default)</option>';
    
    // Add fields
    fields.forEach(field => {
      const option = document.createElement('option');
      option.value = field.id;
      option.textContent = field.name;
      
      // Select this option if it matches the previously selected value
      if (field.id === currentValue) {
        option.selected = true;
      }
      
      dropdown.appendChild(option);
    });
    
    // If a specific value should be selected and it exists, select it
    if (selectedValue && selectedValue !== 'description') {
      const option = Array.from(dropdown.options).find(opt => opt.value === selectedValue);
      if (option) {
        option.selected = true;
      }
    }
  };
  
  // Populate each dropdown
  populateDropdown(featureContentField);
  populateDropdown(storyContentField, 'customfield_10577'); // Default to custom field 10577 for Story
  populateDropdown(subtaskContentField);
}

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
  jiraPreviewSection.classList.add('hidden');
  
  // Hide create button until preview is done
  createJiraBtn.classList.add('hidden');
  previewJiraBtn.classList.remove('hidden');
  
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
    
    // Load custom fields for the selected project
    await loadCustomFields(projectKey);
    
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
    console.log('Loading issues for project:', projectKey);
    console.log('Jira config:', jiraConfig);
    
    const result = await window.api.searchJiraIssues(jiraConfig, projectKey);
    
    console.log('Search issues result:', result);
    
    hideLoading();
    
    if (result.success) {
      // Clear existing options
      jiraParentSelect.innerHTML = '<option value="">None</option>';
      
      console.log('Issues to add to parent selector:', result.issues);
      
      // Add issues
      if (result.issues && result.issues.length > 0) {
        result.issues.forEach(issue => {
          const option = document.createElement('option');
          option.value = issue.key;
          option.textContent = `${issue.key}: ${issue.summary} (${issue.issueType})`;
          jiraParentSelect.appendChild(option);
        });
        console.log('Added issues to parent selector');
      } else {
        console.log('No issues found to add to parent selector');
      }
    } else {
      showStatus(`Error loading project issues: ${result.error}`, true);
    }
  } catch (error) {
    console.error('Error in loadProjectIssues:', error);
    hideLoading();
    showStatus(`Error loading project issues: ${error.message}`, true);
  }
}

// Preview Jira issues before creation
previewJiraBtn.addEventListener('click', async () => {
  if (!gherkinContent) {
    showStatus('No Gherkin content to preview', true);
    return;
  }
  
  const jiraConfig = getJiraConfig();
  
  if (!validateJiraConfig(jiraConfig, ['url', 'username', 'apiToken', 'projectKey'])) {
    return;
  }
  
  try {
    showLoading('Generating preview of Jira issues...');
    
    // Parse the Gherkin content to extract features and scenarios
    const parsedFeatures = await parseGherkinContent(gherkinContent);
    
    // Generate preview items
    previewedJiraItems = generatePreviewItems(parsedFeatures, jiraConfig, selectedFolderName);
    
    // Display preview items
    displayPreviewItems(previewedJiraItems);
    
    hideLoading();
    
    // Show the preview section and create button
    jiraPreviewSection.classList.remove('hidden');
    createJiraBtn.classList.remove('hidden');
    
    // Scroll to preview section
    jiraPreviewSection.scrollIntoView({ behavior: 'smooth' });
    
    showStatus(`Generated preview of ${previewedJiraItems.length} Jira issues`);
  } catch (error) {
    hideLoading();
    showStatus(`Error generating preview: ${error.message}`, true);
  }
});

// Create selected Jira issues
createJiraBtn.addEventListener('click', async () => {
  if (!gherkinContent || previewedJiraItems.length === 0) {
    showStatus('No Jira items to create', true);
    return;
  }
  
  const jiraConfig = getJiraConfig();
  
  if (!validateJiraConfig(jiraConfig, ['url', 'username', 'apiToken', 'projectKey'])) {
    return;
  }
  
  // Get selected items
  const selectedItems = previewedJiraItems.filter(item => item.selected);
  
  if (selectedItems.length === 0) {
    showStatus('No items selected for creation', true);
    return;
  }
  
  try {
    showLoading('Creating selected Jira issues...');
    
    // Create a modified config with selected items
    const configWithSelection = {
      ...jiraConfig,
      folderName: selectedFolderName,
      selectedItems: selectedItems.map(item => ({
        id: item.id,
        type: item.type,
        parentId: item.parentId
      }))
    };
    
    const result = await window.api.createJiraIssues(gherkinContent, configWithSelection);
    
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

// Select all items
selectAllBtn.addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('.preview-item-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.checked = true;
    
    // Update the state in previewedJiraItems
    const itemId = checkbox.getAttribute('data-id');
    const item = previewedJiraItems.find(item => item.id === itemId);
    if (item) {
      item.selected = true;
    }
  });
  
  showStatus('All items selected');
});

// Deselect all items
deselectAllBtn.addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('.preview-item-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
    
    // Update the state in previewedJiraItems
    const itemId = checkbox.getAttribute('data-id');
    const item = previewedJiraItems.find(item => item.id === itemId);
    if (item) {
      item.selected = false;
    }
  });
  
  showStatus('All items deselected');
});

// Helper function to get Jira configuration from form
function getJiraConfig() {
  const isLevel3 = level3Radio.checked;
  
  return {
    url: jiraUrlInput.value.trim(),
    username: jiraUsernameInput.value.trim(),
    apiToken: jiraApiTokenInput.value.trim(),
    projectKey: jiraProjectSelect.value.trim(),
    parentIssueKey: jiraParentSelect.value.trim(),
    hierarchyLevel: isLevel3 ? 'level3' : 'level2', // Selected hierarchy level
    epicNameField: '', // No Epic Name field
    epicLinkField: '', // No Epic Link field
    
    // Get the selected content fields based on hierarchy level
    featureField: isLevel3 ? featureContentField.value : null, // Only used in Level 3 hierarchy
    storyField: storyContentField.value, // Used in both hierarchies
    subtaskField: !isLevel3 ? subtaskContentField.value : null, // Only used in Level 2 hierarchy
    
    epicType: 'Level 3 Epic', // Level 2 Epic type
    featureType: 'Feature', // Default Feature type
    storyType: 'Story', // Default Story type
    subtaskType: 'Sub-task' // Default Sub-task type
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
  const subtasks = issues.filter(issue => issue.type === 'subtask');
  
  // Check if we're using Level 3 or Level 2 as parent
  const isLevel3Parent = level3Radio.checked;
  
  if (isLevel3Parent) {
    // Level 3 → Epic → Feature → Story hierarchy
    
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
  } else {
    // Level 2 → Feature → Story → Sub-task hierarchy
    
    // Create HTML for each feature (directly under the selected Epic)
    for (const feature of features) {
      const featureElement = document.createElement('div');
      featureElement.className = 'jira-item feature';
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
        storyElement.style.marginLeft = '20px';
        storyElement.innerHTML = `
          <div class="jira-item-title">
            <span class="jira-item-key">${story.key}</span>: ${story.summary} (Scenario)
          </div>
          <a href="${story.url}" class="jira-item-link" target="_blank">View in Jira</a>
        `;
        jiraResultContent.appendChild(storyElement);
        
        // Add related subtasks
        const storySubtasks = subtasks.filter(subtask => subtask.storyKey === story.key);
        for (const subtask of storySubtasks) {
          const subtaskElement = document.createElement('div');
          subtaskElement.className = 'jira-item subtask';
          subtaskElement.style.marginLeft = '40px';
          subtaskElement.innerHTML = `
            <div class="jira-item-title">
              <span class="jira-item-key">${subtask.key}</span>: ${subtask.summary} (Sub-task)
            </div>
            <a href="${subtask.url}" class="jira-item-link" target="_blank">View in Jira</a>
          `;
          jiraResultContent.appendChild(subtaskElement);
        }
      }
    }
  }
  
// Scroll to results
  jiraResult.scrollIntoView({ behavior: 'smooth' });
}

// Helper function to parse Gherkin content
async function parseGherkinContent(gherkinContent) {
  // This is a simplified version of the parsing logic in main.js
  try {
    // First, split the content into feature blocks
    const featureBlocks = gherkinContent.split(/Feature:/)
      .filter(block => block.trim().length > 0)
      .map(block => `Feature:${block.trim()}`);
    
    const parsedFeatures = [];
    
    for (let i = 0; i < featureBlocks.length; i++) {
      const featureContent = featureBlocks[i];
      
      // Extract feature name
      const featureNameMatch = featureContent.match(/Feature:\s*([^\n]+)/);
      const featureName = featureNameMatch ? featureNameMatch[1].trim() : `Feature_${i + 1}`;
      
      // Extract Scenarios
      const scenarioRegex = /\n\s*Scenario(?:\s+Outline)?(?:\s*):(?:\s*)/;
      const scenarioBlocks = featureContent.split(scenarioRegex)
        .slice(1) // Skip the feature description part
        .map(block => `Scenario: ${block.trim()}`);
      
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

// Helper function to generate preview items
function generatePreviewItems(parsedFeatures, jiraConfig, folderName) {
  const previewItems = [];
  
  // Generate a unique ID for each item
  let idCounter = 1;
  
  // Convert folder name to Title Case for Epic name
  const toTitleCase = (str) => {
    return str.replace(/\w\S*/g, function(txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  };
  
  // Check if we're using Level 3 or Level 2 as parent
  const isLevel3Parent = jiraConfig.hierarchyLevel === 'level3';
  
  if (isLevel3Parent) {
    // Level 3 → Epic → Feature → Story hierarchy
    
    // Use folder name as Epic name, or default if not provided
    const epicName = folderName ? toTitleCase(folderName) : "Feature Files";
    
    // Create Epic item (Level 2)
    const epicId = `item-${idCounter++}`;
    previewItems.push({
      id: epicId,
      type: 'epic',
      name: epicName,
      summary: epicName,
      parentId: jiraConfig.parentIssueKey || null,
      selected: true // Selected by default
    });
    
    // Create Feature items (Level 1)
    for (const feature of parsedFeatures) {
      const featureId = `item-${idCounter++}`;
      previewItems.push({
        id: featureId,
        type: 'feature',
        name: feature.name,
        summary: feature.name,
        content: feature.content,
        parentId: epicId,
        selected: true // Selected by default
      });
      
      // Create Story items (Level 0) for each Scenario
      for (const scenario of feature.scenarios) {
        previewItems.push({
          id: `item-${idCounter++}`,
          type: 'story',
          name: scenario.name,
          summary: scenario.name,
          content: scenario.content,
          parentId: featureId,
          selected: true // Selected by default
        });
      }
    }
  } else {
    // Level 2 → Story → Sub-task hierarchy
    // Map Feature in file to Story in Jira, and Scenario in file to Sub-task in Jira
    
    // Create Story items (Level 1) directly under the selected Epic (Level 2)
    // These come from Features in the file
    for (const feature of parsedFeatures) {
      const storyId = `item-${idCounter++}`;
      previewItems.push({
        id: storyId,
        type: 'story',
        name: feature.name,
        summary: feature.name,
        content: feature.content,
        parentId: jiraConfig.parentIssueKey || null,
        selected: true // Selected by default
      });
      
      // Create Sub-task items for each Scenario
      // These come from Scenarios in the file
      for (const scenario of feature.scenarios) {
        previewItems.push({
          id: `item-${idCounter++}`,
          type: 'subtask',
          name: scenario.name,
          summary: scenario.name,
          content: scenario.content,
          parentId: storyId,
          selected: true // Selected by default
        });
      }
    }
  }
  
  return previewItems;
}

// Helper function to display preview items
function displayPreviewItems(items) {
  // Clear previous content
  jiraPreviewContent.innerHTML = '';
  
  // Create HTML for each item
  for (const item of items) {
    const itemElement = document.createElement('div');
    itemElement.className = `preview-item ${item.type}`;
    
    // Create checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'preview-item-checkbox';
    checkbox.checked = item.selected;
    checkbox.setAttribute('data-id', item.id);
    
    // Add event listener to update selection state
    checkbox.addEventListener('change', (e) => {
      const itemId = e.target.getAttribute('data-id');
      const item = previewedJiraItems.find(item => item.id === itemId);
      if (item) {
        item.selected = e.target.checked;
      }
    });
    
    // Create content div
    const contentDiv = document.createElement('div');
    contentDiv.className = 'preview-item-content';
    
    // Create title
    const title = document.createElement('div');
    title.className = 'preview-item-title';
    
    // Set title based on item type
    if (item.type === 'epic') {
      title.textContent = `Epic: ${item.name}`;
    } else if (item.type === 'feature') {
      title.textContent = `Feature: ${item.name}`;
    } else if (item.type === 'story') {
      title.textContent = `Story: ${item.name}`;
    } else if (item.type === 'subtask') {
      title.textContent = `Sub-task: ${item.name}`;
    }
    
    // Create details
    const details = document.createElement('div');
    details.className = 'preview-item-details';
    
    // Set details based on item type and hierarchy level
    const isLevel3Parent = level3Radio.checked;
    
    if (item.type === 'epic') {
      details.textContent = `Will be created as a Level 2 Epic`;
      if (item.parentId) {
        details.textContent += ` under Initiative ${item.parentId}`;
      }
    } else if (item.type === 'feature') {
      details.textContent = `Will be created as a Feature under Epic`;
    } else if (item.type === 'story') {
      if (isLevel3Parent) {
        details.textContent = `Will be created as a Story under Feature`;
      } else {
        // In Level 2 parent mode, Stories come from Features in the file
        details.textContent = `Will be created as a Story under Epic ${item.parentId}`;
      }
    } else if (item.type === 'subtask') {
      if (isLevel3Parent) {
        details.textContent = `Will be created as a Sub-task under Story`;
      } else {
        // In Level 2 parent mode, Sub-tasks come from Scenarios in the file
        details.textContent = `Will be created as a Sub-task under Story (from Feature file)`;
      }
    }
    
    // Assemble the item
    contentDiv.appendChild(title);
    contentDiv.appendChild(details);
    itemElement.appendChild(checkbox);
    itemElement.appendChild(contentDiv);
    jiraPreviewContent.appendChild(itemElement);
  }
}
