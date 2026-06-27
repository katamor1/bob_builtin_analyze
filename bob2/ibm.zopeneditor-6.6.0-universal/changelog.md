# IBM Z® Open Editor Change Log

## 6.6.0 - 2026/05/29

IBM® Developer for z/OS® on VS Code:

- IBM® Developer for z/OS® on VS Code is now part of the IBM Bob Premium Package for Z. Z Open Editor automatically unlocks advanced features when running in IBM Bob 2.0.0 with the Premium Package available. Not all features are available yet. Check the Welcome page for the list of unlocked features, as we will be adding more over time. Z Open Editor automatically registers some of its tools with Bob at startup. To use the full set of Z Open Editor MCP tools, you must still create an `mcp.json` file in your workspace. See the IBM Developer for z/OS on VS Code and Premium Package documentation for details.
- New advanced feature: Line Hex Editor. Displays and edits the hexadecimal representation of a single line in a data set. To use it, place your cursor on the line you want to inspect in a data set opened from the z/OS Resources Table or Zowe™ Explorer, right-click, and select **Line Hex Editor** from the **Show In** menu. This feature is useful for diagnosing code page issues and viewing or modifying non-displayable characters. It supports remote sequential data sets and PDS members. Local files are not currently supported.
- Improved the detection of `mcp.json` files when running with AI agents other than IBM Bob. Many of these agents are not officially supported, but you can use our GitHub community to discuss how to make them work and provide feedback. (Issue [609](https://github.com/IBM/zopeneditor-about/issues/609))
- Added comprehensive MCP (Model Context Protocol) copy tools for RSE profiles, enabling AI agents to perform various copy operations:
  - Copy z/OS UNIX System Services files within the same system.
  - Copy MVS data sets (sequential and PDS members) within the same system.
  - Copy between z/OS UNIX System Services and MVS file systems (bidirectional).
  - Copy z/OS UNIX System Services files across LPARs or systems with support for binary mode and background execution.

IBM Z® Open Editor:

- Added support for extended ASCII code pages for PL/I source code expansion. Files opened with ISO8859-1 or Windows-1252 are now correctly encoded before running through the macro preprocessor. This improves support for characters that previously caused issues when translated to UTF-8.
- Improved language server handling when many documents are opened simultaneously. File an issue if you experience abnormal behavior with files containing many copybooks or includes.
- Added Expand Source Code for JCL, supporting expansion of INCLUDEs and PROCs. Additionally, PROC parameter substitution is supported if the supplied parameters can be resolved.
- Changed the default value for the user setting `zopeneditor.server.memoryAllocation` that defines the memory allocation for Java used by our language servers from 512 to 1024.
- Fixed a regression in user build using z/OSMF Zowe™ profiles that prevented uploading a single "additionalDependencies" file if the UNIX System Services workspace folder did not yet exist.
- Added automatic RSE API version checking and upgrade recommendations in the Welcome page for RSE API profiles. The Welcome page now displays the current RSE API version, indicates if an update is recommended, and shows which capabilities would be gained by upgrading. This helps users stay informed about available features and maintain optimal compatibility. This capability relies on the `zopeneditor.advancedCapabilities.enableRseApiActivationCheck` user setting to be enabled for automatic version checking. If disabled, the check runs only when actively connecting to the RSE API.
- Enhanced RSE API profile password change functionality to require password confirmation, preventing system lockout from mistyped passwords. Users must now re-enter their new password to confirm before the change is applied.
- Added support for the `jobEncoding` value in RSE API profiles. This allows specifying the encoding for job submissions with Zowe Explorer `Submit Job` and `Submit as JCL` actions.
- Added support for the `encoding` value in RSE API profiles for use with Zowe Explorer's `Get JCL` action.
- Fixed the z/OS connection check to provide timeout-specific error messages instead of generic HTTP 500 errors. Errors are now logged with more details for improved troubleshooting.
- Added support in Zowe Explorer for RSE API profiles to right‑click and download all data set members and z/OS UNIX directories.
- Fixed the issue where copybooks and include files were not found on Windows when `enforceCaseSensitiveIncludeFileNames` is set to `true`.
- Fixed empty `<PROGRAM>` tag in remote preprocessor XML when running a remote preprocessor on data set members. The preprocessor now correctly populates the tag with the fully qualified data set member name (e.g., `MYUSER.SOURCE.PLI(MYPROG)`). ([Issue 596](https://github.com/IBM/zopeneditor-about/issues/596))
- Fixed remote preprocessor SYSLIB XML serialization to use space-separated values instead of comma-separated values, ensuring compatibility with FEKRNPLI sample REXX script that uses WORD() for parsing. This fixes TSO ALLOC failures when multiple MVS SYSLIB locations are configured in ZAPP property groups. ([Issue 597](https://github.com/IBM/zopeneditor-about/issues/597))

IBM® RSE API Profiles and Plug-in for Zowe CLI:

- Added new `zowe rse check version` command to check the current RSE API server version and receive upgrade recommendations. The command displays the current version, the latest recommended version, and lists missing capabilities that would be gained by upgrading. Use the `--show-capabilities` flag to view detailed capability information for both current and recommended versions.
- Updated the RSE API Typescript SDK with new version checking API (`VersionRecommendation` class) that provides version comparison, capability detection, and upgrade recommendations. This enables automated version validation and capability-aware feature detection in client applications.
- Added character conversion error detection to `download.dataset` and the data-set download CLI command. Invalid bytes found during download are reported in response headers with their byte position and hex value.
- Added support for the `--append-only` option to MVS and UNIX System Services streaming uploads, allowing content to be appended instead of replaced.
- Added new `zowe rse list uss-hierarchy` command to retrieve the complete hierarchy of files or folders under a UNIX System Services directory. Requires RSE API version 1.2.5 or higher.
- Added support for content search in datasets through the `zowe rse search members` command, with detailed examples for member searches, sequential datasets, and UNIX System Services files to improve usability.
- Added support for the `jobEncoding` value in RSE API profiles, allowing a default encoding for job submissions using RSE CLI commands to submit `data-set`, `local-file`, `stdin`, and `unix-file`.
- Added support for event notifications with long-running UNIX System Services commands. The `zowe rse issue unix --notify` and `zowe rse issue unix-shell --notify` commands now return an event notification ID immediately. Use `zowe rse check notification --type unix-command` to wait for command completion and retrieve output.
- Enhanced password change functionality in the `zowe rse change password` command to require confirmation, preventing system lockout from mistyped passwords. Users must now re‑enter their new password to confirm before the change is applied.
- Enhanced job submission commands to support event notification with the `--notify` option. Submissions return an event notification ID that can be used with the new `zowe rse check notification --type job` command to wait for job completion using server-side long-polling. This method is more efficient than client-side polling and works with all job submission methods: `submit data-set`, `submit unix-file`, `submit local-file`, and `submit stdin`. The notification response provides complete event details including duration, status, and job information, in a generic format that can be used for any type of event notification.
- Fixed an issue where binary data set uploads incorrectly reported overflow lines.
- Fixed an issue where z/OS UNIX directories were not created on target LPAR during a copy-cross-lpar action.
- Fixed an issue in the `zowe rse copy data-set-cross-lpar` command where PDS member names with numeric suffixes (e.g., SAM1, SAM2, SAM3) were incorrectly stripped of their digits during upload, causing all members to be uploaded to the same target member name and overwriting each other. Member names now preserve alphanumeric characters correctly.
- Fixed an issue seen with error thrown with `change password` command when token authentication in place.

## 6.5.1 - 2026/05/29

IBM® Developer for z/OS® on VS Code:

- Fixed the issue in the z/OS® Resource Table where PDS member searches by name pattern only (without content search) displayed `0 match for ''` with empty results for RSE type profiles. Member name pattern searches now display properly.
- Fixed the issue where invalid search parameters could lock users out from viewing PDS members in the z/OS Resources Table.
- Fixed the issue where the MCP tool `zowe-get-all-job-spools-output` hung when downloading spool content without specifying an output directory. The tool now resolves to the workspace folder path when no `outDir` is provided.

IBM Z® Open Editor:

- Fixed the issue where user build did not overwrite existing local log files with newer versions after rerunning a build with z/OSMF Zowe™ profiles. ([Issue 604](https://github.com/IBM/zopeneditor-about/issues/604))
- Fixed the issue where Shift-Out/Shift-In decorators were misaligned due to certain characters in specific EBCDIC code pages. ([Issue [#599](https://github.com/IBM/zopeneditor-about/issues/599)](https://github.com/IBM/zopeneditor-about/issues/599))
- Fixed the issue in HLASM where `cmd/ctrl + /` placed the comment symbol in the wrong column.
- Fixed the issue for RSE API profiles in Zowe Explorer where concurrent edit conflicts were not reliably detected for data set members and UNIX System Services files. After conflict resolution, saves now continue to use refreshed ETags so VS Code can trigger compare/conflict handling instead of appearing to save successfully while discarding remote changes. [#601](https://github.com/IBM/zopeneditor-about/issues/601)
- Fixed the issue for RSE API profiles in Zowe Explorer where filtering by exact member name (without wildcards) resulted in 400 errors.

IBM® RSE API Plug-in for Zowe CLI:

- Fixed the issue in the RSE CLI `change password` command where entering a password longer than eight characters resulted in a 401 error. The command failed with "error to execute due to undefined payload".
- Fixed the issue where user were forced to enter credentials when running the `zowe rse copy uclp` command even when a credentials store was in use.
- Fixed the issue in the RSE CLI where running the command `rse-api-for-zowe-cli check password-expiry` resulted in a 401 error.
- Fixed the issue where spool file lists from lower-level APIs did not include job ID and job name in IJobFile. [#605](https://github.com/IBM/zopeneditor-about/issues/605)
- Fixed the issue where copying UNIX System Services files or folders across LPARs caused file content to display in binary format regardless of host encoding.

## 6.5.0 - 2026/04/10

IBM® Developer for z/OS® on VS Code:

- Improved graph export performance in the Program Control Flow and Data Flow browsers.
- Adjusted the default temporary data set allocation for the remote preprocessor to enable variable length records. ([Issue 585](https://github.com/IBM/zopeneditor-about/issues/585))

Fixes and updates to user build:

- Fixed the issue in user build where command line parameters that used ZAPP variables in combination with additional text were not parsed correctly. Now, you can specify lifecycleArgs or buildScriptArgs with an expression such as "--hlq ${dbbHlq}.UB", and user build uses the fully evaluated HQL expression.
- Fixed the issue where user build attempted to create the same upload directory multiple times if the ZAPP "additionalDependencies" property contained GLOB patterns. When you specify a folder location, a `/**` expression at the end is not required. User build automatically uploads the entire folder and its children.
- Fixed the issue in user build where the git attributes check threw errors when additional dependencies were located in a different Git repository than the main program to be built.
- Added a new boolean user setting `zopeneditor.userbuild.userSettings.{preserveWorkspaceNames}` for user build. When enabled, the upload of dependencies from other workspaces in a multi-root VS Code workspace creates a top-level directory in the DBB workspace directory on UNIX System Services using each workspace's name. The previous behavior remains the default: all dependencies are uploaded into a single folder based on the ZAPP variable `application` for Groovy, or the program's workspace name for zBuilder, which is also listed as the application name in the "dbb-app.yaml" file.

New and updated Model Context Protocol (MCP) tools:

- Added MCP tools for accessing program control metadata (`zopeneditor-cobol-get-program-control-flow`, `zopeneditor-pli-get-program-control-flow`) and data flow metadata for COBOL data items (`zopeneditor-cobol-get-data-flow`). These tools enable agents to answer questions about program structure and data usage, such as "Using control flow data, which paragraphs call 730-READ-CUSTOMER-FILE and can this be optimized?" or "Using data flow information, what do I need to change if I increase the length of CURRENT-YEAR from PIC 9(2) to PIC 9(4)?"
- Added three new MCP tools that help users create and manage their Zowe profiles:
  - `zowe-create-team-config` launches the interactive team configuration creation workflow.
  - `zowe-update-basic-credentials` securely updates username and password (credentials are never exposed to LLM).
  - `zowe-update-profile` updates non-sensitive connection properties (host, port, protocol, so on).
- Added new MCP tool `rseapi-update-password-on-host` to update the password on the z/OS system using an interactive workflow. Only available with the RSE API profile type.
- Enhanced the MCP tool `zowe-search-dataset` to support member name search for RSE API profile types.
- Enhanced the MCP tools with optional local file location parameters: `zowe-get-all-job-spools-output` now supports an `outDir` parameter to specify a custom download location. If not provided, the tool downloads to the default location. `zowe-get-dataset-content` and `zowe-get-unix-file-content` now support a `file` parameter to download content directly to a local file. If not provided, the tools return content as text for chat agent use.
- Added more optional parameters to UNIX System Services tools: `zowe-upload-unix-file` (`uploadOptions` with `binary`, `localEncoding`, `encoding`), `zowe-get-unix-file-content` (`getOptions` with `binary`, `encoding`, `localEncoding`, `range`).
- Added optional parameters to JES tools `zowe-get-single-job-spool-output`(`encoding`).
- Added optional parameters to data set tools: `zowe-list-datasets` (`listOptions` with `volume`, `maxLength`, `recall`), `zowe-list-members` (`listOptions` with `volume`, `maxLength`, `recall`), `zowe-get-dataset-content` (`getOptions` with `extension`, `preserveOriginalLetterCase`, `overwrite`, `directory`), `zowe-upload-dataset` (`uploadOptions` with `binary`, `record`, `encoding`, `localEncoding`, `volume`, `recall`), `zowe-issue-tso-command` (`tsoParams` with `account`, `regionSize`, `useNewTsoApis`).
- Added the ability for users to specify a profile name when interacting with Zowe MCP tools. Previously, the tools used the default Z Open Editor Zowe profile. You can now optionally request to use an alternative Zowe profile.
- Added the MCP tool `dbb-download-build-result-attachments` to download the attachments of a build result from a remote environment.
- Added the MCP tool `dbb-get-last-failed-build-result` to retrieve the last failed build result from a remote environment.
- Added the MCP tool `dbb-get-build-result` to retrieve a build result from a remote environment.

IBM Z® Open Editor:

- Enhanced COBOL hover help for EXEC CICS statements, providing comprehensive help including links to online CICS API documentation, command descriptions, options, response codes, and examples.
- Expanded support for EBCDIC code pages by adopting ICU (International Components for Unicode) in the language servers. This improvement enables accurate byte counting and overflow line detection for significantly more code pages. For configuration details, see [Specifying an EBCDIC file encoding to use with the language servers](https://ibm.github.io/zopeneditor-about/Docs/setting_preferences.html#specifying-an-ebcdic-file-encoding-to-use-with-the-language-servers).
- Enhanced HLASM syntax highlighting for both TextMate and Semantic Token highlighting. When Semantic Token highlighting is enabled, significant improvements appear in how continuation lines, comments, and string literals are highlighted. ([Issue [#250](https://github.com/IBM/zopeneditor-about/issues/250)](https://github.com/IBM/zopeneditor-about/issues/250))
- Fixed the issue where JCL code completion sometimes threw errors while typing.
- Fixed an issue that caused inaccurate truncation ranges for overflow lines.
- Added folding range support for HLASM, including folding for macro definitions (MACRO...MEND), structured programming constructs (IF/ELSE/ELSEIF/ENDIF, DO/ENDDO, STRTSRCH/EXITIF/ORELSE/ENDSRCH, CASENTRY/CASE/ENDCASE, SELECT/WHEN/OTHRWISE/ENDSEL), and consecutive comment lines. The feature can be disabled using the new `zopeneditor.hlasm.enableCodeFolding` setting. ([Issue [#317](https://github.com/IBM/zopeneditor-about/issues/317)](https://github.com/IBM/zopeneditor-about/issues/317))
- Fixed the issue where new and renamed default VS Code themes caused syntax highlighting to display incorrectly before semantic token highlighting results were retrieved. Additionally improved compatibility for all default themes that ship with VS Code.
- Fixed the issue where COBOL expand source failed while searching for COPY statements.
- Fixed the issue where EXIT and RETURN statements caused false unreachable code warnings in EVALUATE and PERFORM blocks in COBOL. ([Issue [#541](https://github.com/IBM/zopeneditor-about/issues/541)](https://github.com/IBM/zopeneditor-about/issues/541)), ([Issue [#564](https://github.com/IBM/zopeneditor-about/issues/564)](https://github.com/IBM/zopeneditor-about/issues/564)), ([Issue [#592](https://github.com/IBM/zopeneditor-about/issues/592)](https://github.com/IBM/zopeneditor-about/issues/592))
- Fixed the issue where multiple ENTRY statements caused false unreachable code warnings in COBOL. ([Issue [#212](https://github.com/IBM/zopeneditor-about/issues/212)](https://github.com/IBM/zopeneditor-about/issues/212))
- Fixed the issue where COBOL flagged EXEC SQL CALL procedure names longer than 30 characters as invalid.
- Updated the "Export Support Files" command to also export log files from RSR API servers. The command uses the Z Open Editor default Zowe profile displayed in the status bar. It requires RSE API version 1.2.5 or newer and administrative privileges for the user assigned to that profile.

IBM® RSE API Profiles and Plug-in for Zowe CLI:

- Added profile encoding as the lowest priority fallback for UNIX System Services file upload and download operations. When no explicit encoding is specified through the `--encoding` option, `.zosattributes` file, or `--binary-files`/`--ascii-files` options, the encoding defined in the RSE profile (`profile.encoding`) is automatically applied for text mode transfers. This ensures consistent encoding behavior across all file operations and aligns UNIX System Services operations with MVS data set operations, which already supported profile encoding fallback.
- Added the new admin command `zowe rse admin download-logs` (aliases: `dl-logs`, `logs`) to download RSE server log files as a zip archive. The `--diagnosticsScope` parameter is required and accepts: `USER` (user-specific logs), `SERVER` (server logs), or `ALL` (all logs). Requires RSE API version 1.2.0 or higher.
- Fixed the issue where the `--attributes` parameter and `.zosattributes` file were not handled correctly in non-recursive directory uploads (`zowe rse upload dir-to-uss`). The upload now applies file transfer modes and filtering rules from the attributes file, and files are tagged with the correct remote encoding instead of the local encoding.
- Added support for tilde (`~`) and relative path (`./`) expansion in local file and directory paths for upload and download operations. Users can now specify paths like `~/Documents/file.txt` or `./local/path` in CLI commands and SDK methods, which are automatically expanded to absolute paths.
- Optimized RSE CLI upload or download streaming and concurrency, including flattened recursive UNIX System Services uploads and smarter ETag handling, while fixing upload progress-bar lifecycle/visibility issues to prevent hangs and improve throughput.
- Added support for retrieving VSAM attributes with the `zowe rse create vsam` command. Requires RSE API v1.2.4.
- Addressed typo in data set creation definition option for attribute `ZosFilesCreateOptions.clusterRecovery`.
- Added support for the file extension option when copying MVS to UNIX System Services, passed as a header. Requires RSE API v1.2.4.
- Fixed REST API 400 error when retrieving specific data sets by name. The issue occurred when querying exact data set names (without wildcards) because the API automatically appended `.*` wildcards, causing the query to fail. The fix introduces intelligent pattern detection: the system checks if the exact data set name exists first and only appends wildcards if needed. This ensures both exact data set name queries and pattern-based queries work correctly.
- Fixed the invalid record format error during data set creation by adding VBA support to `recordFormatValidation()`.
- Fixed the issue where special characters in RSE profile owner and prefix values were not properly URL-encoded when listing jobs. Owner and prefix parameters containing special characters (such as `@`, `#`, `$`, `%`) are now correctly encoded before they are added to the endpoint, preventing request failures in Zowe Explorer and CLI commands. [Issue [#593](https://github.com/IBM/zopeneditor-about/issues/593)](https://github.com/IBM/zopeneditor-about/issues/593)
- Fixed an issue where uploading files with numeric-only names to PDS resulted in an invalid data set member name and caused the command to fail; the command now continues processing the remaining valid files instead of skipping them.

## 5.7.3 - 2026/04/10

- Security fixes for third party dependencies.
- Updated to work with Zowe Explorer 3.4.2
- Ships with ZAPP schema 1.9.0

## 6.4.0 - 2026/02/20

IBM® Developer for z/OS® on VS Code:

- Added the ability to export graphs from the Data Flow and Program Control Flow browsers. Supported formats include JSON, XML, DOT (Graphviz), PDF, SVG, and PNG.
- Greatly improved rendering performance for very large programs in the Program Control Flow Browser.
- Fixed the issue in user build where the error reporting data set was deleted even when the Advanced Problems View feature was disabled.
- Increased the maximum allowed number of parallel downloads from 10 to 50 for resolving remote include files. If you are using RSE API, have sufficient bandwidth, and download hundreds of copybooks from MVS, you see a performance increase after switching to a higher value in the user setting `"zopeneditor.zowe": { "maximumParallelFileDownloads": 50 }`. Use caution with z/OSMF, as it reserves an address space for each parallel download request. RSE API uses a different scaling model and works well with this setting.
- Added parallel uploads for user build. Use the setting `"zopeneditor.zowe": { "maximumParallelFileUploads": 50 }` to specify how many parallel uploads to allow. The default is 5, and the maximum is 50. Specify 1 to force sequential uploads. With RSE API 1.2.4 or newer, you gain additional performance benefits from improved tagging support (see RSE API changelog). Use caution with z/OSMF, as it reserves an address space for each parallel upload request.
- Added new Wazi Deploy MCP tools to support listing deployments, environments, and artifacts, including their corresponding query definitions. These tools provide detailed metadata such as timestamps, evidence file paths, application names and versions, environments, package paths, deployed artifacts, and status. They enhance visibility and traceability of deployments. See the documentation for configuration and usage with your AI agent.
- Added MCP tool `zowe-search-dataset` to perform string or regex pattern searches within PDS datasets and members using RSE and z/OSMF profile types.
- Added MCP tool `rseapi-download-unix-folder` for downloading a z/OS UNIX System Services folder to a local folder. Available only with RSE profile type.
- Added MCP tool `zowe-upload-folder-to-unix` for uploading a local folder to a z/OS UNIX System Services folder using RSE and z/OSMF profile types.
- Made MCP tool parameters `jobId` and `jobName` optional for `zowe-list-job-spools`, `zowe-get-single-job-spool-output`, and `zowe-get-all-job-spools-output`.
- Added 30 new IBM ZCodeScan COBOL rules to improve code quality and security analysis (27 for code review, 3 for security review).
- Modified ZCodeScan configuration by migrating 10 rules to use the `PARAMETERS` field instead of the `STATEMENTS` field to improve configuration consistency and clarity. The `STATEMENTS` field is deprecated and is scheduled for removal in future releases. Custom rules that use the `STATEMENTS` field now trigger validation errors under the updated rule schema. Replace the invalid `STATEMENTS` field with the `PARAMETERS` field to comply with the updated schema.

IBM Z® Open Editor:

- Added additional error source information to Quick Fixes to improve presentation and to avoid VS Code truncation. ([Issue 579](https://github.com/IBM/zopeneditor-about/issues/579))
- Added default handling for BMS macros. Hover and code completion support is now provided without requiring a macro library containing BMS macros. See [BMS support](https://ibm.github.io/zopeneditor-about/Docs/editor_codechanges_hlasm.html#bms-support) for more information.
- Added HLASM conditional macros to the instruction set, including `IF`, `WHEN`, `DO`, `SELECT`, `ITERATE`, and others.
- Fixed the issue in COBOL where multi-line COPY REPLACING statements ignored COBOL areas. ([Issue 550](https://github.com/IBM/zopeneditor-about/issues/550))
- Added semantic token highlighting support for VS Code's new Experimental Light and Experimental Dark themes.

IBM® RSE API Profiles and Plug-in for Zowe CLI:

- Added `tag-file` header support to the upload API to automatically tag files during upload. Improved performance by removing explicit GET (file existence) and POST (file creation) checks from the `fileToUSSFile` function, as the RSE API automatically handles file creation.
- Fixed the issue of missing fields in the `zowe rse check job-address-space` command output. Users can now filter responses by `jobClass`, `jobId`, `jobProc`, `jobStep`, `sr`, and/or `srDescription` fields.

IBM® RSE API Profiles and Plug-in for Zowe CLI:

- Enhanced `Search.performSearch()` to be the recommended unified search method that automatically determines search type (content or name) and provides consistent response format.
- Added new unified response types for MVS search operations:
  - `SearchMvsResponse` - Unified response type consolidating all MVS search results
  - `SearchMvsResultItem` - Represents a single search result (dataset or member)
  - `SearchMvsMatch` - Represents a match found in search results
- Deprecated the following search methods in favor of `Search.performSearch()`. These methods will be made unavailable in the next major release:
  - `Search.mvsMembers()` - Use `Search.performSearch()` instead
  - `Search.mvsPds()` - Use `Search.performSearch()` instead
  - `Search.mvsSeq()` - Use `Search.performSearch()` instead
  - `Search.searchMvs()` - Use `Search.performSearch()` instead
- Deprecated legacy search response types in favor of unified types:
  - `SearchMvsMembersResponse` - Use `SearchMvsResponse` instead
  - `SearchMvsMembersResult` - Use `SearchMvsResultItem` instead
  - `SearchMvsMembersMatches` - Use `SearchMvsMatch` instead
  - `SearchMvsPdsResponse` - Use `SearchMvsResponse` instead
  - `SearchMvsPdsResult` - Use `SearchMvsResultItem` instead
  - `SearchMvsSeqResponse` - Use `SearchMvsResponse` instead
  - `SearchMvsSeqResult` - Use `SearchMvsResultItem` instead
  - `SearchMvsSeqMatch` - Use `SearchMvsMatch` instead

## 6.3.0 - 2026/01/23

IBM® Developer for z/OS® on VS Code:

- Added support for PL/I to ZCodeScan. See the documentation and our samples repository for the list of available rules.
- Added the ability to click edges in the Data Flow Browser. Clicking a solid edge opens the COBOL source at the statement that modifies the data, and clicking a dashed edge opens the source at the group's declaration.
- Improved edge interaction in the Data Flow Browser and Program Control Flow Browser by making all edges easier to click and eliminating tooltip flickering when hovering over hierarchical relationships.
- Enhanced the Program Control Flow Browser by adding support for COBOL source files with multiple top-level programs. Place the cursor within any program and run the **Show In Program Control Flow** command (using the command palette or the **Show In** menu by right-clicking) to display its control flow.
- Added support for COBOL source files with multiple top-level programs in the Call Hierarchy feature. When you invoke **Show Call Hierarchy** in a COBOL file containing multiple programs, the hierarchy now correctly displays the call structure for the program at the current cursor position.
- Added a new preference to adjust the HLASM remote macro scan timeout when scanning large data sets. The new preference is `zopeneditor.hlasm.remoteMaclibScanTimeout` and defaults to 3 minutes.
- Updated the Advanced Feature User Build Problems View to address customer requests for the ability to disable and manually configure the feature. You must now specify the parameter `--errPrefix ${errPrefix}` in the ZAPP file to enable the feature. By default, the feature is disabled. The `${errPrefix}` variable in the ZAPP file is automatically populated with a random data set name, but you can provide your own value if you want a predefined name to be used. See the documentation for Z Open Editor and Dependency Based Build, as well as the ZAPP file in our samples repository, for details.
- Fixed an issue where temporary data sets created during user build were not being deleted when using a z/OSMF Zowe profile.
- Fixed user build not uploading multiple additional-dependencies folders.
- Fixed an issue that prevented MCP tools from accessing user build log files.
- Fixed the numbering of "Steps" in the user build output log when not performing a full upload.
- Fixed issues related to reporting incorrect syntax errors when editing files with preprocessor statements using a local preprocessor executable. After running the preprocessor, incorrect syntax errors are now less likely to be reported, depending on the area of code and the content of the expanded macros. Lines with preprocessed macros are displayed in a different color, as syntax highlighting for these lines is currently not possible as they are specific to the macro language you are using. It is strongly recommended that you rerun the preprocessor whenever you make changes to these lines. In some cases, code completion might not work when editing new lines of code near macros. This is a first set of incremental improvements planned for this capability. Please submit Technical Support tickets for specific preprocessing cases that require improvement.
- Minor updates to MCP tool meta-data, such as renaming tools, adding output schemas, and refining descriptions, to improve how chat agents can match the tools to your requests and handle the results.

IBM Z® Open Editor:

- Added Quick Fix code actions support for COBOL for the following scenarios: correcting misspelled keywords, variable names, and function names; adding a qualifier to an ambiguous variable name; and adding a paragraph or section to a PERFORM statement.
- Added Quick Fix code actions support for PL/I for the following scenarios: correcting misspelled keywords or variable names, and adding a qualifier to an ambiguous variable name.
- Added Quick Fix code actions support for JCL for the following scenario: correcting misspelled keywords.
- Added support for semantic token highlighting in JCL.
- Added support for EXEC CICS® INCLUDE resolution and improved semantic token highlighting for EXEC CICS and EXEC SQL statements in HLASM.
- Updated semantic token and TextMate highlighting for all languages on VS Code's Default and High Contrast themes to reduce color changes when semantic tokens are received after parsing completes. ([Issue 563](https://github.com/IBM/zopeneditor-about/issues/563))
- Added EXEC CICS CodeLens for PL/I to enable inspection of properties for CICS resources referenced by statements.
- Added support for code pages containing double-byte character sets in JCL programs, including visualization of shift-out (SO) and shift-in (SI) control characters, as well as codepage-aware truncation. You must specify the codepage either in user settings for local or remote files, or in ZAPP for remote files. [Learn how to associate JCL files with a code page](https://ibm.github.io/zopeneditor-about/Docs/ebcdic_encoding.html#specifying-an-ebcdic-file-encoding-to-use-with-the-language-servers).
- Fixed an issue in COBOL where inserted paragraphs and sections were not aligned correctly.
- Fixed an issue in COBOL where multi-line replacements incorrectly ignored content when it exceeded the right margin.
- Fixed an issue in COBOL where the line offset was incorrect in scenarios involving the REDEFINE function.
- Fixed an issue in the PL/I parser where ambiguous references were not always marked correctly.
- Removed unused node binaries from Zowe™ SDK. ([Issue 574](https://github.com/IBM/zopeneditor-about/issues/574))
- Removed Zowe SDK secret management binaries for unsupported platforms.
- Updated highlighting for lines containing preprocessor statements in COBOL.

IBM® RSE API Profiles and Plug-in for Zowe CLI:

- Improved performance for RSE API calls in Zowe Explorer.
- Implemented support for a new `getCount` API to boost RSE API pagination performance.
- Added a check to detect empty MVS or UNIX System Services files, skipping unnecessary download operations.
- Improved support for copying and pasting data sets across LPARs for RSE API profiles using a new Zowe Explorer API.
- Fixed an issue with deleting RSE API profiles that used token authentication with token auto-refresh enabled on the RSE Rest API.
- Fixed an issue where content pasted into a newly created PDS member was not saved, resulting in data loss.
- Fixed an issue where RSE CLI commands that triggered JWT re-authentication after token expiration failed intermittently with a 401 error because of a stale in-memory session.
- Fixed an issue where editing UNIX System Services folder permissions (Edit Attributes) failed with a REST API 500 error.

## 6.2.0 - 2025/12/05

IBM® Developer for z/OS® on VS Code:

- Updated IBM® ZCodeScan integration with new configuration options and rule-writing capabilities:
  - Added the ability to centrally define project-specific rules in separate Git repositories or shared network drives, and reference those files in a new ZAPP profile. See the [zopeneditor-sample](https://github.com/IBM/zopeneditor-sample/tree/wazi-main/multiroot) multi-root GitHub example for how you can keep rule definitions separate from your application code.
  - Having a 'zcodescan-rules.yml' file at the workspace root location still works, but now requires the respective ZAPP file entry.
  - Added the ability to write declarative custom rules for ZCodeScan. See the example repository and the documentation for more details.
- Redesigned the layout of the Program Control Flow graph nodes to be more compact, with fewer overlapping lines, so it scales better for large programs and improves readability.
- Added a toggle to switch the Program Control Flow Browser between a separate editor tab and the VS Code panel. When opened as an editor tab, it can be moved to a separate window by right-clicking the tab and selecting `Move into New Window` or `Copy Into New Window` (`Cmd/Ctrl + K, O`).
- Added search capabilities to the Data Flow Browser. Type text and press `Enter` to cycle through data items with names that match the input. Regular expression search is also supported (using JavaScript-style regular expressions syntax).
- After displaying a PL/I or COBOL program in the Program Control Flow Browser, the node corresponding to the program element at the current cursor position is now automatically highlighted.
- Added column customization when listing data sets in the z/OS Resources table.
- Fixed an issue where the results counter in the Program Control Flow Browser and Data Flow Browser did not update when cycling through search results.
- Fixed an issue where `SYS1.MACLIB` macros were unnecessarily being scanned when listed in a user's remote maclib ZAPP entry. Z Open Editor already ships with scan data for this data set for different z/OS versions. Custom macros need to be provided in other data sets.
- Fixed an issue where ZCodeScan commands were not registered and would not appear in the context menu under certain conditions related to opening files in a specific order and restarting the editor.
- Added an MCP tool, 'zopeneditor-change-default-zowe-profile,' for changing the IBM® Z Open Editor default Zowe profile.

IBM® Z Open Editor:

- Added localization for Simplified Chinese (zh-cn) and Traditional Chinese (zh-tw) for IBM® Z Open Editor and upcoming Zowe Explorer release.
- Added the 'Show Call Hierarchy' context-menu action for PL/I programs. Right-click on a PL/I procedure or package name to view its call hierarchy.
- Updated HLASM language support with the latest z/OS 3.2 SYS1.MACLIB macro set for code completion. Switch the user setting `zopeneditor.hlasm.zosMacrosVersion` to select the macros of z/OS version 2.5, 3.1, or 3.2 (default).
- Fixed an issue where the HLASM local macro scanner failed to handle mixed-language HLASM macros correctly.
- Fixed an issue where removing entries from `zopeneditor.datasets.<language>Datasets` failed to remove the corresponding patterns from files.associations, ensuring both settings remain correctly synchronized.

IBM® RSE API Profiles and Plug-in for Zowe CLI:

- Fixed an issue where PDS member names were downloaded in lowercase.
- Added error handling in ussCrossLPAR to manage cases where target and source RSE profiles are identical.
- Added new command "mvs-to-uss" which copies the specified PDS, PDS member or SEQ to the UNIX file or folder location.
- Added new command "uss-to-mvs" which copies the specified UNIX file or folder to the specified PDS, PDS member or SEQ.
- Fixed an issue where a profile was being repopulated with new token in the zowe.config file after it had been deleted.

## 6.1.1 - 2025/11/13

IBM® Z Open Editor:

- Includes all fixes provided with Z Open Editor 5.7.2.
- Fixed the issue that prevented using environment variables in Zowe team configuration files when using MCP tools.
- Fixed the issue that prevented uploading nested dependency folders in user builds on Windows.

IBM® RSE API Profiles and Plug-in for Zowe CLI:

- Fixed the issue with the `copy unix-cross-lpar` command to show a more consistent progress bar for large file and directory copies, and updated the command to use a temporary download location rather than current workspace.
- Adopted authOrder for RSE profiles when logged in with token authentication to ensure that sessions retrieved from the CLI use the correct authentication method.
- Fixed the issue with the `disable-symlink-resolution` flag for the `zowe rse search uss` command by adding a version check and an appropriate error message if the RSE API host component is below v1.2.3.

## 5.7.2 - 2025/11/13

(Available at [IBM Mainframe Downloads](https://ibm.github.io/mainframe-downloads/downloads.html#wazi) only.)

- Fixed the issue that user build menu items were not available for REXX files when `zopeneditor.userbuild.alwaysShowCommands` was enabled.
- Fixed issues with using local HLASM macros on Windows when specifying an absolute path with a drive letter and a glob pattern. Added the `includeFileExtensions` user setting to HLASM to enhance the performance of the local macro scanner by preventing scans of non-HLASM files.
- Fixed the issue where local HLASM macros did not work reliably for relative maclib paths in multi-root workspaces.

## 6.1.0 - 2025/10/24

IBM® Developer for z/OS® on VS Code:

[Introducing IBM Developer for z/OS Select 1.0.0](https://www.ibm.com/docs/en/announcements/devops-delivers-developer-zos-select-100-provide-editing-in-eclipse-vs-code-developer-zos-1703-dependency-based-build-303) which is a new product bundle that provides clients with a choice of editors for their application developers. It assists teams by supporting editing preferences in both Eclipse and VS Code. This edition unlocks a different subset of advanced capabilities in Z Open Editor compared to the Enterprise edition. Our redesigned Welcome page helps you explore which capabilities are available during your trial, as well as lists which features are included in Select and Enterprise Edition. For full details, see the documentation.

- New advanced feature: COBOL data flow graph browser to generate and browse a graphical view for a selected variable through the "Show in" menu. This feature helps you examine how a data element is populated, modified, or written elsewhere.
- Program Control Flow Browser now supports PL/I programs.
- Added search capabilities to the Program Control Flow Browser. Type text and press `Enter` to cycle through paragraphs or sections with names matching the input. Regular expression search is also supported (syntax follows JavaScript-style regular expressions).
- Added a "Show Flow From Here To..." action in the Program Control Flow Browser to displays the flow between two selected nodes for both COBOL and PL/I programs.
- We expanded our list of Zowe™ MCP features with the new "userbuild-run-user-build", "userbuild-get-dbb-log", "zcodescan-check-current-program", "zcodescan-check-list-of-local-programs", "zowe-upload-dataset", "zowe-get-all-job-output", "zopeneditor-get-embedded-languages", "zopeneditor-cobol-renumber-file", "zopeneditor-cobol-unnumber-file", and "zopeneditor-cobol-format-file" tools. We also updated "zowe-get-datasets" and "zowe-get-members" to include attributes that support additional use cases.

IBM® Z Open Editor:

- Added the 'Show Call Hierarchy' context-menu action for COBOL programs. Right-click on a COBOL paragraph or section name to view its call hierarchy.
- Fixed the issue in the HLASM TextMate where a rule was unintentionally hidden ([Issue 544](https://github.com/IBM/zopeneditor-about/issues/544)).
- Fixed the issue where the HLASM Local Macro scanner did not handle certain macro parameters correctly ([Issue 552](https://github.com/IBM/zopeneditor-about/issues/552))
- Fixed the bug in the REXX parser that triggered a false diagnostic when a subroutine did not end with a `RETURN` or `EXIT` ([Issue 553](https://github.com/IBM/zopeneditor-about/issues/553)).
- Fixed the bug for some use cases of CICS DFHRESP [Issue 478](https://github.com/IBM/zopeneditor-about/issues/478).
- Fixed the bug where symbolic parameters in copybooks were not always resolved correctly [Issue 509](https://github.com/IBM/zopeneditor-about/issues/509).
- Fixed the bug where value replacement in copybooks was not consistently handled [Issue 511](https://github.com/IBM/zopeneditor-about/issues/511).
- Added a new command "Export Support Files" that exports all editor log files into a single ZIP archive for tech support troubleshooting.

IBM® RSE API Profiles and Plug-in for Zowe CLI:

- Added support for searching data set and member content using RSE profiles in Zowe Explorer.
- Added support for paging spool file content with RSE profiles in Zowe Explorer and with the CLI command `download output` using the `record-range` option.
- Added new `archive` subcommands for working with z/OS UNIX archive files:
  - `create-file` to create a new file within the archive.
  - `create-dir` to create a new directory within the archive.
  - `export-file` to export a file from the archive to a z/OS UNIX path.
  - `import-file` to import a file from z/OS UNIX into the archive.
- Added new `create` sub command `vsam` allowing the creation of VSAM data sets.
- Added support to using allocate-like with a VSAM data set for overriding attributes.
- Added CLI command to copy PDS, PDS member or SEQ dataset to z/OS UNIX location.
- Added CLI command to copy the specified z/OS UNIX file or folder to the specified PDS, PDS member or SEQ.
- Fixed an issue with login that occurred when both a global and a project-level Zowe team configuration file were used. Logging into the RSE API using a global profile would store the token information in the wrong configuration layer, causing the profile definition to break.
- Fixed an issue where the archive subcommands `get-content` and `update-content` failed due to missing header information.
- Fixed an issue where the archive subcommand `get-content` did not correctly save the retrieved file.

## 6.0.0 - 2025/09/19

Breaking changes in version 6 for IBM® Z Open Editor:

- The minimal version of Java required to run Z Open Editor's language server is Java 21 LTS. Please upgrade your local Java installation if you are still on Java 17, and set either the `$JAVA_HOME` environment variable or the `zopeneditor.JAVA_HOME` user setting accordingly.
- VS Code version 1.102.3 is the minimal version into which Z Open Editor 6.0.0 can be installed, as we are utilizing the latest APIs added to VS Code. As always, we encourage users to be on the latest VS Code release, especially if you plan to try the new Model Context Protocol capability added to Z Open Editor. If you are using a cloud-based deployment of VS Code, also verify that it is upgraded to this version. At the time of this release, no version of Red Hat® OpenShift® Dev Spaces includes the required VS Code version. You can continue using Dev Spaces with Z Open Editor 5.7.1.
- As this is a major version upgrade of Z Open Editor we recommend that you request new license activation kits from your IBM sales representative. The current 5.x keys will continue working with this version of the editor, but we recommend upgrading to be ready for future updates. If you are using an RSE API server to automatically unlock the editor, no new keys are required.

IBM® Developer for z/OS® on VS Code:

- Z Open Editor Agent Mode: our editor now provides a Model Context Protocol (MCP) server that gives your AI agent access to many of the editor's capabilities, integrating seamlessly with VS Code's Chat window. You can ask your chat agent about data sets, UNIX files, or currently running jobs, using your Zowe connection security for access. Combine the results with the power of AI to accomplish many advanced tasks. This first release includes 27 MCP tools around Zowe and Z Open Editor configuration files. See our documentation for how to enable and configure the server for your workspaces, and for examples of how to use it.
- COBOL control flow graph browser: Visualize the control flow of your COBOL programs at the paragraph and section level in an interactive graph browser. Use the new browser view to examine the flow in detail with "Show flow from here" and "Show flow to here" actions, and navigate your source code simply by clicking on graph nodes.

IBM® Z Open Editor:

- CICS TS 6.3 support: Updated the language parsers to provide syntax checking, highlighting, and content assistance for new statements and keywords for COBOL and PL/I. See the IBM language documentation for details: [What's new in CICS TS 6.3](https://www.ibm.com/docs/en/cics-ts/6.x?topic=whats-new-in-cics-ts-63).
- Improved COBOL variable validation for the EXEC CICS CodeLens handler.
- Updated the "Expand source code" menu for PL/I programs. It now expands include files and macros and opens the results in a temporary file in a new editor tab, similar to the COBOL editor command.
- Updated HLASM instructions for z17.
- Fixed VEC operations that falsely reported an invalid number of operands for old instruction sets ([Issue 460](https://github.com/IBM/zopeneditor-about/issues/460)).
- Fixed the issue where a user build failed to create the workspace directory when the root directory did not exist.
- Fixed the issue that the user build menus would not appear for JCL files when the `zopeneditor.userbuild.alwaysShowCommands` setting was enabled.

IBM® RSE API Profiles and Plug-in for Zowe CLI:

- Fixed the issue with the CLI command for deleting a VSAM data set that returned a type error when the data set didn’t exist.
- Fixed the issue with the CLI command for comparing UNIX files that contain special characters in the path.
- Added client-side support to replace existing data sets during copy-paste operations when using RSE profiles in Z Open Editor.
- Added `--disable-symlink-resolution` (--dsr) option to the uss-file `search` command, enabling users to skip symbolic-link resolution during file search.

## 5.7.1 - 2025/08/29

- Fixed the issue where the JCL language server showed errors about missing PROC files even when `zopeneditor.jcl.enableResolvingProcs` was set to false. ([Issue 537](https://github.com/IBM/zopeneditor-about/issues/537))
- Fixed the issue where language detection with an RSE API profile ignored your `files.associations` setting in some cases.
- Fixed the issue where language detection logged error messages when opening your local files.
- Fixed the issue where the CLI command to create a member returned a Node.js file system error.
- Fixed the issue where clicking the hyperlink in the Submit Job confirmation dialog resulted in 500 or Not Found errors.

## 5.7.0 - 2025/08/22

IBM® Developer for z/OS® on VS Code:

- New Advanced Feature: Language detection when you open a file from an MVS data set. If you are not using `files.associations` or the `zopeneditor.datasets.<language>Datasets` settings to configure the language of your data set members, and use RSE API profiles, then Z Open Editor tries to detect the language of the file for you. This can be useful for data sets that contain files in many different languages or for data sets that you have not yet used or configured. The detector utilizes the RSE API metadata scanner to guess the language, so you must use an RSE API profile to enable the feature. As the heuristic can be wrong, we added DEBUG-level logging to see its response. Just use the status bar to switch to the correct language when this happens. The feature is enabled by default for licensed users and can be disabled by setting `zopeneditor.zowe.disableRseApiLanguageDetection: true`.
- The z/OS Resources table now also uses the `zowe.ds.paginate.dataSetsPerPage` user setting to define its default page size.
- The Data Elements table now uses a redesigned settings menu that addresses accessibility concerns.

IBM® Z Open Editor:

- Fixed invalid syntax errors for COBOL multi-line `REPLACING` statements and non-blank characters in columns 73-80 when a single operand spanned multiple lines.
- Fixed invalid syntax errors for COBOL `REPLACING` statements when replacing contents inside a function call.
- Fixed the COBOL language server's Symbol Reference algorithm for redefined ambiguous references to ensure the correct symbol reference is returned.
- The Z Open Editor COBOL language server now integrates with the IBM CICS for Zowe Explorer VS Code extension. The first integration feature in this release adds support for displaying a VS Code CodeLens inside Z Open Editor on EXEC CICS statements in COBOL source code. This enables you to inspect properties of the CICS resource referenced by the statement in a new graphical view.
- In the last release, we added variable checks when editing ZAPP files that populate the Problems view for undefined variables and introduced mouse hovers that show the values of some variables. In this release, we refined the feature to offer preview hovers for even more predefined and user-defined variables. When a variable value cannot be shown because it is computed dynamically, such as when running a user build for a specific file, the hover now indicates this.
- Fixed the issue where glob patterns in ZAPP property group locations matched only subdirectories, excluding the base directory ([Issue 526](https://github.com/IBM/zopeneditor-about/issues/526), [527](https://github.com/IBM/zopeneditor-about/issues/527)).

IBM® RSE API Profiles and Plug-in for Zowe CLI:

- Removed the volume serial parameter from delete, submit, upload, and download data set commands. The parameter is now only supported through RSE API in the create data set command.
- Added VSAM support for allocate-like and delete data set commands. This feature requires RSE API v1.2.3.
- Updated the error message displayed when executing commands that require a newer versions of the RSE API than the one currently available.

## 5.6.0 - 2025/07/25

IBM® Developer for z/OS® on VS Code:

- Added an "Export to CSV" action to the Data Elements View to export data elements from a COBOL or PL/I program to a spreadsheet.
- Regular expressions are now supported for search operations in the Data Elements View.
- Optimized the workflow of the remote preprocessor execution to reuse and clean up temporary data sets.

IBM® Z Open Editor:

- Added UNC filepath support for ZAPP on Windows. You can now specify an absolute UNC path or a path with a mounted drive letter in the "locations" section of your property groups to fetch copybooks and include files from these locations. To enable this support make sure you have configured the VS Code settings `security.restrictUNCAccess` and/or `security.allowedUNCHosts` correctly and that you have authenticated access to these drives before using Z Open Editor. Note that a VS Code restart is required when changing these settings.
- Added support for `POINTER-32` in the COBOL TextMate Grammar for cases where semantic token syntax highlighting fails or is disabled ([Issue 491](https://github.com/IBM/zopeneditor-about/issues/491)).
- Updated behavior for the REXX outline view. When you select a subroutine label in the outline view, it highlights the entire subroutine.
- Updated ZAPP file editing to show undefined variable names in the VS Code Problems view. Also added mouse hovers to the editor that show the current value of a variable based on a user setting, such as `${dbbHlq}`. Variables that are computed at runtime, such as `${buildFile.basename}`, are not shown in the hover but are recognized in the Problems view if spelled incorrectly.
- Fixed an issue with PL/I syntax highlighting for FILE VARIABLE [Issue 392](https://github.com/IBM/zopeneditor-about/issues/392)

IBM® RSE API Profiles and Plug-in for Zowe CLI:

- Added support for Archive commands for z/OS UNIX files. Commands included are LIST_FILES, GET_CONTENT, UPDATE, and DELETE.
- Adopted the Zowe Explorer pagination feature in the Data Sets tree view for RSE API profiles. Paging is enabled for lists of data sets and members. Use the setting `zowe.ds.paginate.dataSetsPerPage` to configure the page size or to disable.
- Fixed the issue where editing and saving a newly created UNIX file through Zowe Explorer on Windows added unintended EOL characters.

## 5.5.0 - 2025/06/24

IBM® Developer for z/OS® on VS Code:

- New advanced feature: Introducing IBM ZCodeScan providing a new linting capability available as an advanced feature for customers, both in the editor and in build automation pipelines. Experience it in Z Open Editor using the trial license, which highlights code issues in the Problems view and inline with the code. Find more details in the documentation.
- New advanced feature: Data Elements View which presents a sortable, searchable UI that displays information about the data elements in COBOL or PL/I programs and their included copybooks or include files. Open it through the new "Show in" right-click menu in the editor and on local or remote file icons. Find more details in the documentation.
- Added a new RCE action to launch RCE in a VS Code webview. The existing action to launch RCE in an external browser is still available to users. Two new settings were added to disable the RCE webview and external browser launch actions, since the webview only work with servers that have valid certificates.
- The Remote Console Emulator (RCE) can now be launched with an RSE API profile using token authentication. RSE API v1.2.2 or newer must be installed to use this functionality. If the installed RSE API version is older, Z Open Editor prompts the user to enter a username and password to launch RCE.
- Added support for using Zowe Explorer's environment variables-based authentication for RCE's webview and external browser display.
- Fixed the issue in user build where additional dependencies of type .yaml or .json were not uploaded to z/OS as UTF-8 files by default.
- Fixed the issue in user build where temporary sequential data sets created during a build were not cleaned up when the build was interrupted or canceled.
- Fixed the issue in the preprocessor where the context menu to compare the current file with the preprocessor output available in a z/OS data set did not appear.
- Unified predefined ZAPP variables between IDz on VS Code and Eclipse so teams can use ZAPP files in either editor. Instead of using variable names such as `${zopeneditor.userbuild.userSettings.dbbHlq}`, you can now use `${dbbHlq}`, which works in both editors. The old names still function, so migration is not required. We also introduced two new predefined variables `${javaHome}`, which provides the absolute path to the Java home directory used by Z Open Editor, and `${workspace}`, which provides the absolute path of the workspace in which the ZAPP file resides. Both variables are helpful for defining preprocessor profiles.

IBM® Z Open Editor:

- Updated language parsers to support syntax checking, highlighting, and content assistance for new statements and keywords in supported programming languages. Find more details in the IBM language documentation and these blog posts:
  - [IBM Enterprise COBOL for z/OS V6.5](https://community.ibm.com/community/user/blogs/roland-koo1/2025/05/30/ibm-enterprise-cobol-for-zos-65-unleashes-the-powe)
  - [IBM Enterprise PL/I for z/OS V6.2](https://community.ibm.com/community/user/blogs/premkumar-swaminathan/2025/04/01/ibm-enterprise-pli-for-zos-v62)
- Implemented support for semantic token syntax highlighting for COBOL. Conditional compilation syntax highlighting is significantly improved. Some behavior may differ slightly due to differences between VS Code's semantic token highlighting and its TextMate highlighting. You can customize token coloring in your workspace by taking advantage of VS Code's `editor.semanticTokenColorCustomizations` setting, or disable semantic token highlighting entirely with `editor.semanticHighlighting.enabled`. See more details on customizing your semantic tokens in [VS Code's documentation](https://code.visualstudio.com/docs/configure/themes#_editor-semantic-highlighting).
- Added file type icons for all languages supported by Z Open Editor.
- Updated COBOL code snippets so that they insert inline with the cursor, allowing seamlessly insertion while typing code.
- Updated the behavior of `zopeneditor.jcl.enableResolvingProcs` to align more closely with `zopeneditor.hlasm.enableResolvingMacros`. When the setting is enabled, it searches SYS1.PROCLIB if a valid Zowe Explorer connection and MVS PROCLIB property group are defined in your ZAPP file.
- Updated some syntax highlighting behavior in HLASM to better match versions prior to 5.2.0, when semantic token highlighting was introduced.
- Fixed the issue where trailing whitespaces that exceeded the maximum line length triggered a truncation warning. The previous behavior leaving these whitespaces without prompting the user has been restored. ([Issue 149](https://github.com/IBM/zopeneditor-about/issues/149))
- Fixed the issue where modifying a ZAPP file fired `didChange` events for visible programs. ([Issue 409](https://github.com/IBM/zopeneditor-about/issues/409))

IBM® RSE API Profiles and Plug-in for Zowe CLI:

- Added new command `zowe rse edit`, which allows editing data sets and UNIX files locally in the editor.
- Added new command `zowe rse compare`, to compare z/OS data sets, UNIX files, and spool files, with support for comparisons against local files as well.
- Updated token expiry time string formatting for RSE API CLI and Zowe Explorer, and added the ability in the CLI to prompt the user to reauthenticate when the token expires.
- Updated a misleading message that appeared when token authentication was expired or not found.

## 5.4.1 - 2025/05/14

- Added the ability to execute the preprocessor with custom file extensions.To enable preprocessing, register your file extensions using the `files.associations` setting and/or the `zopeneditor.datasets.cobolDatasets` or `zopeneditor.datasets.pl1Datasets` user settings.
- The preprocessor running on z/OS® for local files now also uses the `zopeneditor.autoPreprocessor` user setting. When multiple ZAPP profiles exist that apply to local files and this setting is enabled, for example, a local and an MVS profile, Z Open Editor uses the first one listed.
- Z Open Editor now prompts for credentials if a Zowe™ profile without stored or previously entered credentials is used to execute the remote preprocessor. These credentials are then shared with other functions as described above.
- Added a new setting `zopeneditor.jcl.enableResolvingProcs` to toggle the retrieval of PROC targets in JCL files. This behavior was previously always enabled but now defaults to disabled with the value "false" to reduce the amount of z/OS traffic generated when opening JCL files. Note that the context menu operation "Expand source code" is currently unavailable unless the setting is enabled by setting it to "true".
- Fixed the issue where user builds performed with z/OSMF and SSH Zowe CLI profiles did not download the log files after a build failure.
- Fixed the issue that may cause corrupted content when saving or uploading files from Windows to a data set with Shift-In or Shift-Out characters using RSE API Zowe profiles.
- Fixed the issue where copybook resolution with an RSE API Zowe profile spawned excessive mainframe threads while fetching PDS members. ([Issue 481](https://github.com/IBM/zopeneditor-about/issues/481))
- Improved credentials management with Zowe Explorer 3.2.0 when using `"autoStore": false` in your Zowe team configuration files. You now get prompted for your credentials once, which are then in a common memory cache until the editor restarts. This works now for reusing credentials across the Zowe Explorer views, running a user build, running the preprocessor, and resolving include files from z/OS. Note that you might get prompted for your z/OSMF and SSH passwords separately at the moment, which is under exploration for future improvement.

## 5.4.0 - 2025/04/25

IBM® Developer for z/OS® on VS Code:

- Updated advanced feature: Added the option to run a preprocessor on z/OS when editing a local file. The local file is uploaded to a location specified in the new ZAPP property "programDataSet" before the remote preprocessor runs. Currently, this preprocessor command must be executed manually through the context menu. The feature will use the `zopeneditor.autoPreprocessor` user setting in a future release.
- Added the ability to toggle searching with regular expression in the z/OS Resources table when searching for file names or within file content in sequential data sets, partitioned data set members, or UNIX files when using RSE API Zowe™ profiles.
- Added Cancel button when searching in data sets or UNIX files in the z/OS Resources table using RSE API Zowe profiles to abort long running searches.
- Fixed the issue where the z/OS Resources Table displayed data sets incorrectly after setting a data set name pattern in the "Filter" menu.
- IBM CICS for Zowe Explorer and CICS Plugin for Zowe CLI are included and supported in the download packages for IDzEE and ADFz customers.
- Published two extension packs in the VS Code Marketplace and Open-VSX that provide a single button install of all the VS Code extensions available for "IBM Developer for z/OS® Enterprise Edition (IDzEE)" and "IBM Application Delivery Foundation (ADFz)".
- The trial period for Advanced Capabilities in Z Open Editor has been extended to 90 days for new installations.

Z Open Editor:

- Added the Expand Source Code context-menu command for JCL.
- Fixed the incorrect evaluation of lines with double-byte characters for parsing, truncation, and visualizations in COBOL and PL/I. Added back the byte counter in the status bar that shows the actual byte count next to the VS Code column count. This counter only appears in lines with double-byte content. To achieve an accurate byte count, users must specify the encoding either in user settings for local or remote files or ZAPP for remote files. Z Open Editor then internally converts the lines back to EBCDIC using the specified encoding before performing the byte count and parsing the code. ([Issue 463](https://github.com/IBM/zopeneditor-about/issues/463))
- Fixed the issue in the HLASM server where code completion on an empty continuation line is not handled correctly. ([Issue 487](https://github.com/IBM/zopeneditor-about/issues/487))
- Fixed the issue in PL/I where PL/I Procedures did not have correct selection range in the outline view.
- Fixed the invalid COBOL syntax error with multi-line REPLACING statements and non-blank characters in columns 73-80. ([Issue 449](https://github.com/IBM/zopeneditor-about/issues/449))
- Fixed the invalid COBOL syntax error for the LENGTH OF special register when LENGTH is specified in the REPOSITORY section. ([Issue 431](https://github.com/IBM/zopeneditor-about/issues/431))
- Fixed the invalid COBOL syntax error in COPYBOOK with parameter delimiters in parenthesized expressions. ([Issue 442](https://github.com/IBM/zopeneditor-about/issues/442))
- Fixed the COBOL parser issue of not being able to resolve references to ASCENDING or DESCENDING KEY variables with OCCURS clauses. ([Issue 186](https://github.com/IBM/zopeneditor-about/issues/186))
- Fix the COBOL expand source error when handling empty lines inside a COPY directive. ([Issue 474](https://github.com/IBM/zopeneditor-about/issues/186))
- Fixed the invalid syntax error in Db2 cursor names. ([Issue 380](https://github.com/IBM/zopeneditor-about/issues/380))
- Fixed the invalid syntax error "The REDEFINES clause must begin in Area B" on replaced statements.
- Fixed the invalid syntax error in EXEC CICS RETRIEVE commands indicating that INTO/SET is required.
- Updated EXEC CICS code snippets so that they work correctly when a user types EXEC CICS in the code editor.
- Rewritten parse code for "find" results when searching and downloading log files at the end of user build to work with different implementations of find as well as different z/OS shells in which it is executed. The path to the `/bin/find` command is now hard-coded, as the zopen community's GNU find command uses different command parameters and is not compatible. Let us know if you find more cases in which this does not work. ([Issue 353](https://github.com/IBM/zopeneditor-about/issues/353))
- The Zowe CLI profiles cache handling was rewritten for cases where a credentials manager is not used and the autoStore setting is set to false in Zowe team configuration files. In this case you are prompted for credentials when needed for each session, for example when using Z Open Editor in Red Hat OpenShift Dev Spaces. Now you do not get prompted as often, as the way the credentials are remembered is improved.
- Fixed the RSE API profile password expiry check to only take place after the user is connected to z/OS successfully and not to initiate on its own connection.

IBM RSE API Profiles and Plug-in for Zowe CLI:

- Added the package version value to the RSE API plug-in schema meta-data to initiate updates of `zowe.config.schema` properties when you register with Zowe Explorer and Zowe CLI.
- Added support to display the expiration date of data sets along with other attributes.
- Added an error message in Zowe Explorer when you attempt to save a data set that is currently locked.
- Fixed the issue of RSE API data set encoding mappings that is incorrectly interpreted.

## 5.3.0 - 2025/03/21

IBM Developer for z/OS on VS Code:

- New advanced feature: New Remote Console Emulator (RCE) providing z/OS green screen support in Z Open Editor for customers who purchased IBM Developer for z/OS Enterprise Edition (IDzEE) with Remote System Explorer API server. This is the same advanced emulator that you find in the Eclipse version of IDz, but it is integrated with Zowe Explorer authenticating your session via your RSE API Zowe profile.
- Improved advanced feature: The z/OS Resources table now supports paging for MVS data sets and members if you are using RSE API v1.2.1 or newer.

Z Open Editor:

- Added PROCs to our JCL language support providing document links and on-hover file preview capabilities.
- Fixed issues causing IndexOutOfBoundsException and NoSuchElementException to be shown in the error logs for HLASM. ([Issue 486](https://github.com/IBM/zopeneditor-about/issues/486) and [Issue 487](https://github.com/IBM/zopeneditor-about/issues/487))
- Various accessibility fixes for screen reader support and keyboard navigation.

IBM RSE API Profiles and Plug-in for Zowe CLI:

- Added new sub-command to the `submit` group, `uss-file` allowing the submission of a USS file as JCL.
- Added a warning/error message for truncation of records during file upload to datasets, displayed on Zowe Explorer. This feature mimics the behavior seen in z/OSMF.
- Added a new `--forceTruncated` flag in the CLI, false by default, to allow users to confirm whether they wish to proceed with the file(s) upload when truncation occurs. If the flag is not specified or set to false, the user will be prompted with a 'yes or no' query before continuing the upload.
- Added Zowe compatibility information message to post installation check. [#492](https://github.com/IBM/zopeneditor-about/issues/492)
- Fixed an issue seen with RSE API profiles loading PDS members in Zowe Explorer with RSE Rest API older than v1.1.6.

## 5.2.0 - 2025/02/07

- New advanced feature: preview hovers and code completion for HLASM custom macros that are stored in z/OS data sets. For code completion IBM Remote System Explorer API server v1.2.0 or newer is required, because RSE API's scans your macros on z/OS before retrieving them and produces the meta-data required. Depending on the size of your maclib, the initial scan may take a few seconds to build up the cache. See our [documentation](https://ibm.github.io/zopeneditor-about/Docs/advanced_custom_macros.html) for more details on this feature and how to set up your ZAPP file for your remote maclibs.
- Added uploading local HLASM custom macros to user build.
- Started the adoption of language server-supported semantic syntax highlighting by improving syntax highlighting for various HLASM operations and continuation lines.
- Added a progress bar when loading larger sets of remote copybooks or include files from z/OS data sets. This progress notification has a 'Cancel' button for users to cancel pending requests.
- Fixed the issue where remote copybook resolution would continue even if a valid connection could not be established to z/OS as specified in the Zowe profile. ([Issue 465](https://github.com/IBM/zopeneditor-about/issues/465))
- Added a new user setting `zopeneditor.userbuild.alwaysShowCommands` that enables the user build menu items for all files, and not just COBOL, PL/I, and HLASM, with the exception of registered include files for these three languages. This will allow users to run user builds with custom Groovy and ZBuilder scripts on files of other languages. This is an experimental feature that might by replaced with a ZAPP centric solution in the future. ([Issue 351](https://github.com/IBM/zopeneditor-about/issues/351))
- Fixed the issue where copybooks and include files from remote z/OS locations were included in the user build upload step. ([Issue 470](https://github.com/IBM/zopeneditor-about/issues/470))
- Fixed the issue where COBOL Expand Source Code was not working for remote files opened via Zowe Explorer ([Issue 472](https://github.com/IBM/zopeneditor-about/issues/472)).
- Fixed the issue that the preprocessor would try running on ZAPP changes even though it was disabled in the user settings for automatic updates.
- Fixed the issue of Outline view content not appearing in some scenarios.

IBM RSE API Profiles and Plug-in for Zowe CLI:

- Added a password expiry warning for active RSE profiles in Z Open Editor. This warning will appear when the password is within 14 days of expiring. The warning will appear once per day until the password is either reset or the warning is snoozed. Users can snooze the warning for a set number of days. Initially, the snooze option will delay the warning for 7 days before reappearing. After the second snooze, the warning will then reappear 3 days before the password expiration. A final snooze option will show the warning at 1 day before the password expires. This ensures that users are continuously reminded of password expiry without overwhelming them with notifications, allowing for flexibility in managing their passwords.
- Added new command to the rse download group allowing the download of unix file directories to the local workspace.
- Removed the `http` value from the RSE API Zowe profile schema to add clarity that only the `https` protocol is supported with RSE profile types at the moment. ([Issue 466](https://github.com/IBM/zopeneditor-about/issues/466))
- Fixed the issue that prevented updates to UNIX encoding file attributes using RSE API profiles in Zowe Explorer.
- Added support for proxy servers to RSE API profiles available in Zowe Explorer. Use the VS Code proxy settings to configure your server. See documentation for details.
- Added commands to lock, unlock, and get lock information for data sets.
- Updated the unix-cross-lpar command with the ability to copy entire UNIX directories from one LPAR to another.

## 5.1.0 - 2024/12/11

- Remote include files downloaded from MVS will now be resolved using Zowe Explorer's virtual file system API introduced with the Zowe v3 release. Z Open Editor no longer writes include files to the temporary, on-disk directory used in previous versions. All data is now managed in memory using VS Code's virtual document content provider system.
- Remote include files downloaded from MVS that were resolved when opening a program can now be opened by ctrl/cmd-click, edited, and saved back to MVS utilizing the new Zowe Explorer virtual file system API. By default these include files will be opened as read-only to avoid accidental changes. If you want to allow editing and saving then you need to change a new setting available in the `zopeneditor.zowe` setting table. Add `readonlyRemoteIncludeFiles` from the drop-down and set it to `false`.
- When resolving remote include files from MVS with the `zopeneditor.zowe` setting `listBeforeDownload` enabled, Z Open Editor now checks the existence of the data set containing the requested member before checking if the member exists. Only after both checks succeed will it download the member from MVS. It will recheck the existence of the data set every 5 minutes when processing pending requests. Enable this setting to avoid z/OSMF log entries when files are not found. However, enabling the setting will have a significant performance impact. ([Issue 456](https://github.com/IBM/zopeneditor-about/issues/456))
- MVS and USS files accessed in the z/OS Resources Table will be opened using Zowe Explorer's virtual file system. This change fixes an issue where edits to USS files opened with the table were not pushed back to the host. ([Issue 458](https://github.com/IBM/zopeneditor-about/issues/458))
- Fixed the issue where comments preceding a COBOL program statement appeared in the VS Code sticky-scroll section at the top of the editor. ([Issue 437](https://github.com/IBM/zopeneditor-about/issues/437))
- Improved COBOL & JCL folding range support to still provide some folding when the editor shows syntax errors.
- Improved performance when computing PL/I content assist suggestions for code with very large expressions.
- Fixed the issue where the JCL parser would show invalid syntax errors for `MEMLIMIT=` in JOB card statements.
- Fixed the issue of the language server logging null pointer exceptions when hovering over multiline macro declarations in HLASM code.
- We extended our advanced preprocessor feature to now support expanding PL/I macros. As our PL/I language server does not yet support macros this feature will help eliminate the syntax errors developers see when writing PL/I code with macros. The way it works is that the preprocessor runs a REXX program on z/OS that uses the compiler to expand the macros. The expanded source code is sent back to the language server, which then applies a diff to show in hovers how the macros were expanded as well as eliminates the wrong syntax errors by parsing that expanded source instead. You can continue editing the original source file. When you add new macro references or make changes to the macro definition just rerun the preprocessor. There is also a user setting to automatically run the preprocessor at document save or focus change. As always, see our [documentation](https://ibm.github.io/zopeneditor-about/Docs/advanced_preprocessor.html) for more details. A sample REXX application and ZAPP preprocessor configuration you can find here: <https://github.com/IBM/zopeneditor-sample/tree/wazi-main/preprocessor>

IBM RSE API Plug-in for Zowe CLI:

- Added ranging/paging options to list all members command.
- Added new sub-command `zowe rse issue tso-shell` that use RSE API v1.1.0 or higher raw data streaming endpoint for issuing TSO commands.
- Fixed the issue when trying to download USS files or Datasets to a fully qualified directory target path.
- Added new unix-cross-lpar command to the rse copy command group, allowing users to copy unix files from one LPAR to another.
- Fixed the issue to include the header "bytes-on-host" in runTask for MVS, UNIX streaming downloads.
- Fixed the issue where the streaming APIs would sometimes hang if the API call threw an error.
- Fixed the issue where submitting TSO command via Zowe Explorer would return errors.
- Fixed an issue to throw error for the cli commands when basic authentication is not supported by rse profile.
- Added UNIX file move command to move existing unix files/folders
- Fixed the issue with sorting PDS members of RSE profiles by creation date and modified date.

## 5.0.0 - 2024/10/18

Breaking changes:

- Java 17: We are now building our language server with Java 17, which is now the minimum Java version required for Z Open Editor. The editor will not work with Java 11 anymore. We recommend IBM's Semeru Runtime or JDK. Distributions from Oracle and OpenJDK will also work.
- VS Code v1.91 or newer: As part of the upgrade to Java 17 we are able to use newer versions of language server APIs provided by the Eclipse LSP4J project and Microsoft. As a result we are also increasing the required version for VS Code for our extension to v1.91 or newer.
- Zowe v3: Zowe Explorer 3.0.0 or newer is now required. Z Open Editor v5 will now download and install Zowe Explorer v3. Zowe Explorer v2 will not work anymore. For IBM RSE API Plugin for Zowe CLI the requirement is now Zowe CLI v8.

New features and fixes:

- Localization: Z Open Editor and Zowe Explorer are now available for the [VS Code display languages](https://code.visualstudio.com/docs/getstarted/locales) French, German, Japanese, Portuguese, and Spanish. This also includes syntax error messages provided by the COBOL, PL/I, JCL and REXX language servers. Download the respective language pack and switch.
- Added support for the new [IBM Dependency-Based Build version 3.0.0](https://www.ibm.com/docs/en/dbb/3.0?topic=overview-what-is-new-noteworthy) providing a new build framework and scripting model. Use it for user build directly from Z Open Editor, which continues to support DBB v2 as well.
- Fixed the issue that user build would sometimes hang when downloading multiple log files. ([Issue 446](https://github.com/IBM/zopeneditor-about/issues/446))
- Addressed issue of existing ZAPP files being overwritten by adding concurrency and file existence checks. ([Issue 444](https://github.com/IBM/zopeneditor-about/issues/444))
- Added JCL Include file support to language servers and ZAPP files. It works with file level statements inside the JCL file with document links and hovers. Check the documentation for how to use ZAPP property groups for JCL.
- Added on-hover DSN resolution to JCL language support. It reveals the DSN with dereferenced values using the SET variables in the file.
- Added support for JCL command statements. The language server now recognizes the command statements with commands/shortcut (e.g SETPROG/V).
- Added user settings `zopeneditor.[cobol|jcl].enableCodeFolding` to enable/disable code folding.
- Added more improvements to JCL and COBOL code folding for comment and conditional blocks.
- Fixed several issues in the HLASM language support and added a progress tracking pop-up for HLASM long-running operations such as loading remote macros.
- Added a new user setting `zopeneditor.encodings.filePatterns` which maps filename glob patterns to an EBCDIC file encoding. When editing files with double-byte characters, our langauge servers need to know the target encoding on z/OS to compute the right line length. Use this setting to specify the EBCDIC encoding to be used when it is placed back on z/OS. It only controls what encodings are passed to the language servers. To control encodings used for file conversions when uploading or downloading z/OS resources, use your ZAPP file or Zowe profile. The setting is evaluated with the following rule set:
  1. If an RSE profile was used to access the file, Z Open Editor will first look for an encoding specified by your RSE mappings (either in your `zapp.yaml` or the location in the `zopeneditor.zowe.defaultRseConversionMappingsFile` setting).
  2. If no RSE mappings exist or if you are using a z/OSMF profile to access the file, Z Open Editor will check for any matches between the file's path and the patterns defined in `zopeneditor.encodings.filePatterns`.
     - These patterns should be specified as glob patterns. A single asterisk `*` matches any number of characters within a path segment, including none. A double asterisk `**` matches any number of path segments, including none. For example, `{ **/COBOL/*.cbl : IBM-930 }` will assign any file paths containing a directory named `COBOL` ending with a `.cbl` extension an encoding of `IBM-930`. [Learn more about how to specify glob patterns.](https://code.visualstudio.com/docs/editor/glob-patterns)
  3. If no matches are found, the encoding specified in the Zowe profile is used.
  4. Local files will only be matched against the `zopeneditor.encodings.filePatterns` setting for an encoding.

IBM RSE API Plug-in for Zowe CLI:

- Added an encoding parameter to `submit`, `download output`, and `view spool-file-by-id` commands.
- Added new CLI command `admin-commands cancelactivity`, to stop all of user's long-running activities in a specified service.
- Fixed the issue of displaying `N/A` as the job state instead of `ACTIVE` in Zowe Explorer Jobs treeview.
- Fixed the issue where changing password on the host was not outputting success message when rest request was successful.
- Fixed the issue where after submitting a JCL job in Zowe Explorer the pop-up announcing the Job id with a hyperlink would throw error. ([Issue 452](https://github.com/IBM/zopeneditor-about/issues/452))
- Fixed the issue where submitting multiple jobs as a batch request with via z/OS Resource Table would return 400 error inconsistently for some of the jobs submitted.
- Fixed the issue seen with copy and paste functionality of UNIX files with special characters in the path and filename returning a 400 error.

## 4.5.1 - 2024/09/27

IBM RSE API Plug-in for Zowe CLI:

- Fixed the issue of not being abe to list data sets members using RSE API profiles in Zowe Explorer. ([Issue 443](https://github.com/IBM/zopeneditor-about/issues/443))

## 4.5.0 - 2024/09/19

- Added experimental context-menu command to expand the current COBOL program. It currently expands copybooks and opens an new editor tab with a temporary file showing the result. The expansion utilizes our language server and is currently limited, not providing evaluation of conditional compilation, yet.
- Fixed the bug that caused incorrect symbol names in the COBOL outline view for code lines with trailing comments and sequence numbers.
- Fixed the issue where JCL code folding ranges were computed incorrectly for lines with trailing comments and the folding range for JCL JOB cards were missing sub-element, i.e. EXEC steps.
- Fixed the issue where JCL code completion were giving incorrect suggestions when a statement starts with `// DD` by using DD as a label name for DD, EXEC or JOB statements.

Advanced features:

- Completed the MVS search capabilities in the z/OS Resources table by adding PDS member search. You can look for strings inside all your members of the data sets currently listed in the table or qualified by a naming pattern for the members. Results will be shown in the table and allow you to navigate to file locations with a simple click. Requires RSE API Zowe profiles.
- Added UNIX System Services search capabilities in the z/OS Resources table allowing you to search files with name patterns as well as the contents of these files. Results will be shown in the table in the same ways as MVS search results allowing you to navigate to file locations with a simple click. Requires RSE API Zowe profiles.
- Added preprocessor support for PL/I in addition to COBOL. Execute a processor that transform your custom code into valid PL/I locally on your workstation or on z/OS and continue editing your original program in Z Open Editor.
- Various bug fixes for resolving HLASM custom macro definition and providing code completion in the editor.

IBM RSE API Plug-in for Zowe CLI:

- Performance improvement for retrieving all the member names of a data set with a large number of members.
- Added `--lc` local encoding option for MVS and UNIX upload and download commands.
- Added new command `data-set-cross-lpar` for copying datasets from one LPAR to other.
- Added new `change` sub-command `unix-file-encoding` that updates the UNIX file target encoding.

## 4.4.0 - 2024/08/12

- Fixed the issue where Java was not being found on Windows or Linux when Z Open Editor searched the user's system. ([Issue 420](https://github.com/IBM/zopeneditor-about/issues/420))
- Added code folding to our COBOL language server, which features folding for Divisions, Sections, Paragraphs, Data-items, and EXEC SQL/CICS statements. Also added code folding range support to JCL.
- Improved the COBOL and JCL Outline views to include comments in the selection ranges when clicking an outline node.
- Fixed the issue with the resolution order for the `NAMES()` compiler option in PL/I when it was listed before include file locations.
- Added the file extension `.dbd`, `.mfs`, and `.pcb` to the defaults for our HLASM editor.
- We now provide snippet style code completion for HLASM operations and macros. Use tab to fill out or remove various parameters when the operation or macro is selected from the code completion list. The editor will then also show syntax errors when manually typing operation parameters incorrectly.
- Added Go to References support for HLASM Operations and Macros to see references within the same file for a selected operation.
- Fixed the issue in JCL where an incorrect error was shown for `DD` statement: "JCL incorrectly highlights empty DD line as error".
- Fixed the issue in JCL where an incorrect error was shown for `EXEC DLI` and `XOPTS(DLI)` statements.
- Performance improvements for language server document requests when finding the copybooks/include files. The language server now prioritizes requesting the most recently opened documents.
- Experimental: all Z Open Editor VS Code extension strings have been localized to French and German using IBM's AI machine translation. Let us know if you like these translations.

Advanced features:

- New feature: added filter and search operations to the z/OS Resources table. You can now search within the content of sequential data sets that are currently listed in your table; search requires using IBM's RSE API. We also added new filter options to the table for RSE API and z/OSMF to help you refine the list displayed for the Zowe query directly in the table. More search and filter capabilities will be added for RSE API users soon.
- Combined "last modified" date and "last modified" time columns into "last modified" in z/OSMF PDS member views of the z/OS Resources Table.
- Fixed the issue where the z/OS Resources Table was not compatible with MVS date formats in RSE API v1.1.5.
- Various fixes, refinements and improvements for remote preprocessor support such as improved logging of the remote preprocessor execution output, better error handling, support for z/OSMF with TSO Zowe profiles, added the 'Compare preprocessor input and output files' command to remote preprocessor files as well as improvements for managing the output file.
- Added a progress bar and a Cancel button to user build operations. After clicking the Cancel button, user build will wait until any remote operation is completed and then stop.

IBM RSE API Plug-in for Zowe CLI:

- We are now providing a variant of the RSE API CLI Plug-in that can be used for installation in air gapped development environments. Find `ibm-rse-api-for-zowe-cli-airgap-4.4.0.tgz` in our IBM Wazi for VS Code Zip file at <https://ibm.github.io/mainframe-downloads/downloads.html>.
- Fixed the issue with multiple items included in data set filter search with RSE profiles.
- Fixed the issue reported using RSE CLI for downloading files when using Nodejs v20. ([Issue 427](https://github.com/IBM/zopeneditor-about/issues/427))
- Added a new `change` sub-command: `clear-tag` which clears the tags of the specified UNIX System Services file.

## 4.3.0 - 2024/06/18

**Note**: Important update for the release of version 4.3.0 of IBM Z Open Editor: [IBM watsonx Code Assistant for Z](https://www.ibm.com/products/watsonx-code-assistant-z), which supports AI-assisted transformation of COBOL to Java for modernizing applications, has now been moved into it's own VS Code extension IBM watsonx Code Assistant for Z version 2.0.0. All functionality has been migrated into this new dedicated extension. Receive your copy of the Z Code Assistant via your Passport Advantage Online account. See the [Documentation](https://www.ibm.com/docs/en/watsonx-code-assistant-4z) for more details.

- New advanced feature: run your custom COBOL preprocessor on z/OS directly from our editor and edit your files without any syntax errors caused by preprocessor statements. We now offer local preprocessor execution and editor integrations as well as remote execution via TSO commands on z/OS.
- All new JCL language server: with this release we add language support for [z/OS MVS JCL](https://www.ibm.com/docs/en/SSLTBW_3.1.0/pdf/ieab600_v3r1.pdf). This first version includes the following features:
  - Improved syntax highlighting
  - Real-time syntax errors
  - Code completion using `Ctrl/Cmd + Space`
  - Outline view
  - On-enter rules in Textmate grammar for JCL
    - Auto prefix newline with `//` if previous line prefixed with `//` (except for in-stream declarations i.e. `DD *`). Indentation is inherited (up to column 16 for non-empty lines). JOB declarations are automatically indented to column 16
    - Auto comment continuation for lines prefixed with `//*`
  - Vertical rulers at significant JCL column numbers (2, 10, 11, 15, 16, 72, 80)
  - JCL Custom tabstops (Default tabstops are: [0, 2, 10, 15, 19, 29, 39, 49, 59, 71, 72])
  - Support for commenting and uncommenting highlighted selections using `Ctrl/Cmd + /`
- Completed support for PL/I v6.1 January 2024 Refresh with updated syntax highlighting, outline view, content assist, real-time syntax checking, and other language related features. See this [blog post](https://community.ibm.com/community/user/ibmz-and-linuxone/blogs/di-hu1/2024/01/31/january-2024-documentation-refresh-for-enterprise) for details. Additionally, support for the new `JSONIGNORE`, `JSONNULL` keywords was added.
- Fixed the issue in the PL/I editor evaluating the names for include files differently than the compiler if the name includes special characters.
- Fixed the issue of false unreachable code warnings around EXEC CICS PERFORM + HANDLE statements. ([Issue 52](https://github.com/IBM/zopeneditor-about/issues/52))
- Fixed the issue of false unreachable code warnings around EXEC SQL WHENEVER statements. [Issue 63](https://github.com/IBM/zopeneditor-about/issues/63))
- Fixed the issue in the REXX editor showing incorrect syntax errors for `ELSE` statements in certain scenarios.
- Fixed the issue in HLASM where optional operands were not correctly accounted for when evaluating the number of operands provided. ([Issue 418](https://github.com/IBM/zopeneditor-about/issues/418))
- Added support for double-byte character editing. The editor will decorate double-byte character strings using guillemets icons and display a byte counter in the status bar giving users information about how many bytes they have left for the current line to avoid truncation.
- Extended the status bar information for the active Zowe profiles, making it an active button with options to change the profile selection. For RSE API profiles, it even provides the option to update the z/OS password when clicked.
- Fixed the issue where renaming sequential data sets using the z/OS resources tables would temporarily show empty attributes for the renamed data set.

IBM RSE API Plug-in for Zowe:

- Added a check for Zowe CLI version compatibility that is executed by the RSE API plugin for Zowe CLI during installation.
- Uploading files to z/OS UNIX System Service using RSE API profiles can now automatically detect if the file is binary.
- Fixed the issue of showing an incorrect error message when no data sets were found that match a search pattern.

## 4.2.0 - 2024/05/16

- New advanced feature: custom macro resolution in HLASM programs with references to macros in local files. The HLASM editor shows hovers, document links, go to definition, and code completion for macros. This feature works with one to many macro declarations per include file, which is achieved by pre-scanning macro files if they can be found in local ZAPP property groups. Read more about this feature in our documentation.
- Improved advanced feature: the z/OS resources table is updated to also support UNIX System Services. You can browse, filter, sort, open, download, upload, create, and copy your unix folders and files with the same user experience as in our previous release for MVS and JES. In addition, you find many UX refinements and polish for all views of this table. We also fixed
  - presenting and sorting numbers and dates based on the user's locale.
  - presenting DSNTYPE for MVS data sets, even if the value is not provided by z/OSMF.
- Added support for COBOL User Defined Function Prototypes. See [COBOL documentation](https://www.ibm.com/docs/en/cobol-zos/6.4?topic=applications-using-function-prototypes) for details.
- Fix the issue where formatting EXEC SQL statements resulted in incorrect syntax ([Issue 400](https://github.com/IBM/zopeneditor-about/issues/400)).
- Reorganized our startup and restart code to avoid problems such as [Issue 403](https://github.com/IBM/zopeneditor-about/issues/403).

IBM RSE API Plug-in for Zowe:

- Fixed the issue of spool files not being correctly exported when their record length exceeded that of the destination dataset, resulting in truncation.
- Fixed typographical errors in the new common-properties commands.
- Fixed the issue that is seen downloading all members of a data set.

IBM watsonx Code Assistant for Z:

- Added editing of local variable names during class generation that will then be used during Java method generation.
- Added editing of method input parameters during class generation that will then be used during Java class and method generation.
- Improved Java method generation by sanitizing the COBOL code, such as removing comments and contents from columns 1-6 and 73-80.
- Fixed the issue where for some edge cases the Java method generation was returning an empty code block.
- Fix the issue where Java classes and methods were not appearing in the watsonx Code Assistant for Z tree view when the COBOL program was located in the top-level workspace folder.
- Fixed the issue of the editor opening the same Java file in multiple editor tabs when using the watsonx Code Assistant for Z tree view.
- Added support for proxy servers for watsonx interactions utilizing the VS Code settings `http.proxy`, `http.proxyStrictSSL`, `http.proxyAuthorization` when `http.proxySupport` is switched to `on`.
- Various fixes and refinements for the watsonx tree view interactions related to item and source code selection.

## 4.1.0 - 2024/03/28

- Added CodeLens for viewing the COBOL source that watsonx Code Assistant for Z is using to generate a method's logic.
- COBOL files in watsonx Code Assistant for Z will no longer open in read-only mode.
- Added a new walkthrough for users to get a step by step guide on how to use watsonx Code Assistant for Z. You can access the walkthrough from the Z Open Editor Welcome page or from the VS Code Welcome page.
- Added new job attributes option for listing additional job attributes in RSE API Plug-in for Zowe CLI.
- Added ability to search MVS Members, Partitioned Data Sets and Sequential Data Sets by name or content for RSE API Plug-in for Zowe CLI.
- Added ability to do classification scans on MVS and UNIX resources for RSE CLI.
- Fixed the issue of failing downloads from z/OS for some file types using RSE API.
- Fixed issue where downloading all spools with RSE profiles would not include the default `.txt` format.
- Fixed the issue where SETC values were causing the HLASM parser to fail in certain scenarios. ([Issue 396](https://github.com/IBM/zopeneditor-about/issues/396))
- Added new options for listing additional job attributes in RSE API Plug-in for Zowe CLI.
- Added new commands for storing and retrieving name/value pairs with RSE's Common Properties service in RSE API Plug-in for Zowe CLI.
- Fixed the issue of failing downloads from z/OS for some file types using RSE API profiles.
- Fixed the issue where downloading spool files with RSE API profiles would be stored with invalid file extensions.

IBM watsonx Code Assistant for Z updates:

- Added a walkthrough for new users to get a step by step guide on how to use watsonx Code Assistant for Z. You can access the walkthrough from the Z Open Editor Welcome page or from the VS Code Welcome page.
- Added a new CodeLens when editing generated Java code to view and navigate to the COBOL source that watsonx Code Assistant for Z was using to generate a Java method.
- COBOL files selected for Transformation in watsonx Code Assistant for Z will no longer open in read-only mode.

## 4.0.0 - 2024/03/15

IBM Z Open Editor v4.0.0 is the first release to introduce a set of all-new enterprise-level advanced capabilities. While the core Z Open Editor continues to provide full language support for COBOL, PL/I, REXX, and HLASM for free, this release adds capabilities for enterprise-level development use cases that go beyond program editing. They cover capabilities that you would typically only find in our commercial editing solutions such as IBM Developer for z/OS Enterprise Edition (IDzEE). With this release, we started adding these capabilities to Z Open Editor under the same licensing terms as IDzEE and a 60-day evaluation license. IDzEE customers can unlock the features by using RSE API or separately distributed activation kits. For more information, see [IBM Documentation](https://ibm.biz/code-whatsnew).

To emphasize, none of the other features that you were using in previous releases are impacted by the update. Previous features are still available for free and will still be maintained and enhanced as always. We are also still fully committed to supporting z/OSMF and RSE API for the free as well as advanced capabilities.

Only the following three new features require a license. Our goal is to provide more and more advanced features such as these to Z Open Editor in the future:

1. Local preprocessor support for COBOL: run a preprocessor on your local workstation driven by a new ZAPP profile type and then continue editing with full syntax checking (except for the preprocessor statements) and automatically rerunning the preprocessor at save. Compare the preprocessor generated code with your code side-by-side. Support for running the preprocessor on z/OS will be added in a future release.
1. z/OS Resources table: an all-new feature rich view that extends Zowe Explorer with a sortable table. Gain insights into your jobs and data sets by listing, filtering, and sorting on many available properties.
1. Advanced Dependency-Based user build error reporting: User build logs are now automatically downloaded, parsed, and presented in the editor's Problems view with descriptions and error codes. Navigate to errors in your code with a mouse click in the Problems view to review and fix your issue and then rerun your build.

We reorganized the Z Open Editor Welcome page for you to see the status of your trial license as well as to unlock features by importing an activation kit or connecting to an RSE API server with configured IDzEE licenses.

Free languages updates:

- Added support for the COBOL v6.4 February 2024 Refresh with updated syntax highlighting, outline view, content assist, real-time syntax checking, and other language related features. See this [blog post](https://community.ibm.com/community/user/ibmz-and-linuxone/blogs/dan-zhang1/2024/02/26/february-2024-documentation-refresh-for-enterprise) for details.
- Added support for the COBOL v6.4 October 2023 Refresh with updated syntax highlighting, outline view, content assist, real-time syntax checking, and other language related features. See this [blog post](https://community.ibm.com/community/user/ibmz-and-linuxone/blogs/jun-qian-zhou1/2023/10/31/october-2023-documentation-refresh-for-enterprise) for details.
- Added support for the PL/I v6.1 January 2024 Refresh with updated syntax highlighting, outline view, content assist, real-time syntax checking, and other language related features. See this [blog post](https://community.ibm.com/community/user/ibmz-and-linuxone/blogs/di-hu1/2024/01/31/january-2024-documentation-refresh-for-enterprise) for details.
- Added support for the CICS v6.2 Beta Refresh with updated syntax highlighting, outline view, content assist, real-time syntax checking, and other language related features.
- Added support for the z/OS 3.1 default HLASM macros. z/OS 3.1 is now the default option. To change your z/OS level, search `zopeneditor.hlasm.zosMacrosVersion` in settings.
- Fixed the issue where the HLASM Language Server did not parse non-english characters correctly. ([#389](https://github.com/IBM/zopeneditor-about/issues/389))
- Added the debug scheme to our language clients, enabling full language server support providing you with features such as Outline view, Go To Definition, Find All References even when running IBM Z Open Debug sessions. ([#360](https://github.com/IBM/zopeneditor-about/issues/360))

Free RSE API Plug-in for Zowe CLI updates:

- Z Open Editor extends the Zowe Explorer's Jobs view experience: open a spool file in Zowe Explorer and Z Open Editor will automatically provide JCL and messages syntax highlighting.
- Added support for changing file tags on USS for RSE API profiles in Zowe Explorer.
- Added support to show partitioned data set member attributes for RSE API profiles in Zowe Explorer.
- Added support for creating a data sets for RSE API profiles using the new templates from Zowe Explorer.
- Added support for Zowe profile encoding with DBB User Build download of log files.
- Added new command `issue unix-shell` for RSE API profiles that utilizes a streaming command output and allows users to set environment variables for the executing shell.
- Added new command `export spool-file` for RSE API profiles allowing export of job spool files to a sequential data set or data set members.
- Added support for refreshToken and auto-refresh-token for RSE API profiles in Zowe Explorer.
- Switched to using RSE API streaming for raw content when uploading to and downloading from MVS, UNIX System Services, and JES files.
- Fixed the issue with creating a partitioned data set of the type LIBRARY for RSE API profiles did not work correctly.
- Fixed the issue of command `issue unix` returning an incorrect exit code.
- Fixed the error when submitting jobs using the `--wfo` (wait for output) option using RSE API profiles. ([#385](https://github.com/IBM/zopeneditor-about/issues/385))

## 3.4.0 - 2024/02/29

- Fixed the issue with Embedded EXEC CICS statements where EXEC CICS GET CHANNEL was marked with the error "RESP expected instead of this input". ([Issue 361](https://github.com/IBM/zopeneditor-about/issues/361))
- Fixed the issue with Embedded CICS EXCI statements where CICS EXCI was marked with the error "RESP expected instead of this input".
- Fixed the issue with Embedded SQL statements where SQLCA symbols were not resolved when an "EXEC SQL INCLUDE SQLCA" statement was inside of a conditional compilation block. ([Issue 379](https://github.com/IBM/zopeneditor-about/issues/379))
- Fixed the issue of incorrectly showing an error about the absence of an end directive when the conditional compilation directive ">>define" was on the last line of a Copybook file. ([Issue 374](https://github.com/IBM/zopeneditor-about/issues/374))
- Fixed the issue where COBOL COPY statements with a "." but without a whitespace were marked with an error.
- Fixed the issue where document links were not resolving correctly when multiple documents were opened in parallel that pointed to the same include files in COBOL, PL/I, and HLASM files. ([Issue 363](https://github.com/IBM/zopeneditor-about/issues/363))
- Fixed the issue where document links would not remove the red underline for an include file after loading correctly in COBOL, PL/I, and HLASM files. ([Issue 363](https://github.com/IBM/zopeneditor-about/issues/363))
- Fixed the issue where REXX syntax highlighting would break when an empty comment statement was present `/**/`. ([Issue 384](https://github.com/IBM/zopeneditor-about/issues/384)).

IBM watsonx Code Assistant for Z updates:

- Replaced the COBOL-centric class generation preview with a new Java-centric presentation for watsonx Code Assistant for Z. Users can now preview the Java classes to be generated in an expandable table view that outlines the variable and method member names next to their mapped COBOL names. They can click hyperlinks within the mapping view to navigate directly back to the COBOL source code files for comparison.
- Updated the watsonx Code Assistant for Z tree view to show a breakdown of method members per Java class that can be generated by the assistant's AI component. These methods are based on COBOL section and paragraph names and become available after the initial Java class generation step has been completed.
- Updated the watsonx Code Assistant for Z tree view to support a new workflow for reopening saved COBOL-to-Java mappings and regenerating Java code.
- Updated the watsonx Code Assistant for Z tree view with new icons and icon decorators that visualize which Java members mapped from COBOL paragraphs have already been generated and which not.
- Updated error handling, error message dialogs, and log file messages.
- Fixed the issue of the Welcome page checkbox for enabling/disabling watsonx Code Assistant for Z not being synchronized with the respective user setting.

## 3.3.3 - 2023/12/15

- Fixed the issue for COBOL where SKIP1, SKIP2, SKIP3, and EJECT tokens were not being handled correctly when placed within other statements to control white space. ([Issue 307](https://github.com/IBM/zopeneditor-about/issues/307))
- Fixed the issue where conditional compilation statements were not being handled correctly when placed in a `>>WHEN OTHER` phrase. ([Issue 366](https://github.com/IBM/zopeneditor-about/issues/366))
- Fixed the issue where the COBOL parser could hang or crash when a file's final line ended with a character in column 7.
- Fixed the issue where a language server would start before all ZAPP files were processed missing settings such as compiler options. ([Issue 364](https://github.com/IBM/zopeneditor-about/issues/364))
- Fixed the issue where the RSE API plugin for Zowe CLI command to upload a file to a UNIX System Services directory would show an error.
- Various bug and serviceability fixes as well as UI refinements for IBM watsonx Code Assistant for Z. Generate Java classes now by using the icon next to the COBOL program name or by using the context menu. When entering an API key you will now receive a confirmation message after a server-side validation check.

## 3.3.2 - 2023/11/28

- Required security updates for third party dependencies.
- Fixed the COBOL parsing issue where intermediate data names would be using an incorrect context. ([Issue 362](https://github.com/IBM/zopeneditor-about/issues/362))
- Fixed multiple issues related to COBOL conditional compilation that caused incorrect syntax error messages. ([Issue 154](https://github.com/IBM/zopeneditor-about/issues/154), [Issue 329](https://github.com/IBM/zopeneditor-about/issues/329))

## 3.3.1 - 2023/11/07

- Corrected the default URL for the IBM watsonx Code Assistant for Z server setting.

## 3.3.0 - 2023/10/25

New: IBM watsonx Code Assistant uses generative AI to accelerate code generation and increase developer productivity for application modernization. IBM watsonx Code Assistant for Z is now enabled in IBM Z Open Editor to drive the selective and incremental transformation of COBOL business services into well-architected high-quality Java code. It uses the inventory and analysis tools of IBM Application Discovery and Delivery Intelligence (ADDI) to support development teams in refactoring business services in COBOL, transforming COBOL code to Java code, and validating the resulting outcome. Learn more and sign up for a trial at <https://www.ibm.com/products/watsonx-code-assistant-zos>.

Other fixes and enhancements in this release:

- Added support for CICS v6.2 Beta to COBOL and PL/I language servers.
- Added support for line and block comment shortcuts in PL/I and REXX.
- Machine instruction statements in HLASM are now identified when the number of operands is incorrect. Assembler instructions are not supported at the moment.
- Improved the parsing behavior of HLASM language servers, particularly around continuation lines. Symbols that are continued should now have that reflected when you hover over references. Symbols that are used in continuation lines now support language functionalities, such as hover, Go to Definition, and Find References.
- Fixed the bug where lowercase and mixed-case macros were not correctly displaying document links in HLASM.
- Added support for internal macros that are declared in an HLASM file. Macros that are declared in an HLASM file now support code completion, hover, and Go to Definition in the file. Note that macros declared with the same name as a default SYS1.MACLIB macro will take precedence over the default macro.
- Added `.mac` as another default file extension for HLASM program files.
- Improved syntax highlighting around %INCLUDE statements in REXX.
- A ZAPP file will now be automatically generated if none can be found in any of your workspaces when a COBOL, PL/I, HLASM, or REXX file is opened for the first time. This ZAPP file will search in all your local folders for include files, such as copybooks, so you should modify it for a more specific path or remote MVS locations afterwards. This behavior can be disabled with the new user setting "zopeneditor.zapp.generateZappOnDemand". Include file statements in all of these languages now also have the Quick Fix menu entry to open ZAPP files for troubleshooting and to open the ZAPP documentation for quick reference.
- Changed the behavior of the "Run user build with full upload" command to now upload also all files that are specified with `additionalDependencies` in the ZAPP file. ([Issue 297](https://github.com/IBM/zopeneditor-about/issues/297))
- Fixed the issue where user build did not properly filter search results for logs. ([Issue 353](https://github.com/IBM/zopeneditor-about/issues/353))
- Fixed the issue where user build related editor menu items and command palette items were displayed for COBOL and PL/I include files.
- Fixed the issue where user build menu items and command palette items were not displayed for VS Code 1.76 and earlier versions. ([Issue 349](https://github.com/IBM/zopeneditor-about/issues/349))
- Fixed the issue where user build did not handle SSH keys for authentication in Zowe SSH profile. ([Issue 355](https://github.com/IBM/zopeneditor-about/issues/355))
- Fixed the issue with RSE API in Zowe Explorer where the user was prompted for username and password when using a token for authentication.
- Added the ability to change owner, group, and permissions of Unix files on RSE CLI.
- Added the ability to check a user's password expiration date with RSE CLI.
- Fixed the issue where default RSE profiles were not displayed by default in Zowe Explorer's tree views when the team configuration profile did not contain z/OSMF profiles.
- Added functionalities for RSE profiles, including copying files and directories in z/OS UNIX System Services, copying data sets, and cancelling jobs.
- Added support for editing attributes in z/OS UNIX System Services for RSE profiles in Zowe Explorer.
- Fixed the issue where RSE API Plug-in for Zowe CLI returned duplicate values when executing the list all members command using wildcard pattern parameters.
- Fixed the issue where RSE API Plug-in for Zowe CLI did not return the correct error messages when executing the list or download all members command using incorrect parameters.
- Fixed the issue where the Zowe profile status bar was not updated after edits were made to the team configuration profiles for RSE API profiles.
- Added job timestamp to the output of the list jobs command for RSE API Plug-in for Zowe CLI when running commands against RSE API server v1.1.3.

## 3.2.3 - 2023/10/11

- Fixed the issue where Z Open Editor would show an incorrect warning about initializing Secure Credentials. ([Issue 359](https://github.com/IBM/zopeneditor-about/issues/359))
- Fixed the issue where RSE API profiles that were using token-based authentication stored token details incorrectly in certain situations.
- Fixed the issue where building projects that were not managed with Git would throw Git errors. The fix changes the behavior that when no Git repository can be found then all .gitattributes files are ignored.

## 3.2.2 - 2023/09/15

- Fixed the issue in COBOL where `DEFINE(compilation-variable-name)` was not applying the default value `B'1'`. (part of [Issue 154](https://github.com/IBM/zopeneditor-about/issues/154))
- Fixed the issue in COBOL where COBOL keywords are not able to be used as compilation-variable-name before a `>>DEFINE` statement. (part of [Issue 154](https://github.com/IBM/zopeneditor-about/issues/154))
- Fixed the issue where user build was not properly filtering search results for logs. ([Issue 353](https://github.com/IBM/zopeneditor-about/issues/353))
- Fixed the issue where RSE API plugin for Zowe CLI returned duplicate values for list all members.
- Fixed the issue where the Zowe profile status bar field would not get updated after making edits to RSE API profiles in team configuration files.
- Security fix limiting telemetry data volumes.

## 3.2.1 - 2023/07/19

- Added syntax and content assist support for the `LOCATION` options (`LOC24` and `LOC31`) in the `GETMAIN64 EXEC CICS` embedded CICS command.
- Fixed the issue where the PL/I `PROCESS MAR/MARGIN` options did not accept a third parameter. ([Issue 344](https://github.com/IBM/zopeneditor-about/issues/344))
- Fixed issues in the HLASM outline view to correctly handle duplicate elements such as `CSECTS` and `DSECTS` that are continued. Symbols that are reassigned will still point to the final declaration to prevent the outline from becoming overcrowded.
- Fixed the issue in user build where menu items and commands were not available when VS Code 1.76 or earlier versions were used. ([Issue 349](https://github.com/IBM/zopeneditor-about/issues/349))
- Fixed the issue in user build for COBOL and PL/I where a copybook or include file with a name that was a substring of another copybook or include file name was not identified as a dependency correctly.
- Fixed the issue that prevented the default RSE API Zowe CLI profiles to be displayed in Zowe Explorer's tree views at startup when Zowe team configuration profile files did not contain a z/OSMF profile.

## 3.2.0 - 2023/06/16

- Added support for the COBOL v6.4 April 2023 Refresh with updated syntax highlighting, outline view, content assist, real-time syntax checking, and other language related features. See this [blog post](https://community.ibm.com/community/user/ibmz-and-linuxone/blogs/yuan-jie-song1/2023/04/28/april-2023-documentation-refresh-for-enterprise-co) for details.
- Fixed the coloring of the keyword `NOT` in COBOL. ([Issue 328](https://github.com/IBM/zopeneditor-about/issues/328))
- Fixed the missing syntax errors when statements (such as `COPY`) start to the left of Area A and overflowing data names (for example in `USING` statements) start to left of Area B. ([Issue 340](https://github.com/IBM/zopeneditor-about/issues/340))
- Fix the issue where comments were misinterpreted within a COPY statement when using an empty quoted pseudo text and the == identifier. ([Issue 248](https://github.com/IBM/zopeneditor-about/issues/248))
- Removed the ability to perform Number and Unnumber actions when COBOL Language Server is not running. ([Issue 189](https://github.com/IBM/zopeneditor-about/issues/189))
- Fixed certain COBOL words not highlighting correctly when placed at the end of a line. ([Issue 346](https://github.com/IBM/zopeneditor-about/issues/346))
- Added support for the PL/I v6.1 March 2023 Refresh with updated syntax highlighting, outline view, content assist, real-time syntax checking, and other language related features. See this [blog post](https://community.ibm.com/community/user/ibmz-and-linuxone/blogs/di-hu1/2023/03/09/march-2023-documentation-refresh) for details.
- Fixed the issue that caused PL/I comments to show a report when starting in column 1. ([Issue 135](https://github.com/IBM/zopeneditor-about/issues/135))
- Fixed the issue with PL/I code completion when a variable is in the same column with a DCL statement.
- Added preview hovers and clickable hyperlinks to open include files in REXX.
- Added support for jump targets as well as `RSECT`, `LOCTR`, and `COM` control sections in the HLASM outline view.
- Fixed the issue where preview hovers failed to load for HLASM COPY statements when the copied document was closed after previously being opened by using the hover's hyperlink.
- Added the user settings "zopeneditor.\<language\>.disableProblems" for each language to enable/disable the Problems view and syntax errors shown within the editor while maintaining other language features. It will allow users to continue working in the program with some language features despite parsing issues. This will not work in all circumstances as some syntax errors will also break other language features. ([Issue 199](https://github.com/IBM/zopeneditor-about/issues/199) and [Issue 203](https://github.com/IBM/zopeneditor-about/issues/203))
- Added the ability to define custom ZAPP variables in your personal user or workspace settings. Define variables in a new mappings table under `zopeneditor.zapp.variables` in the VS Code settings editor and then reference them in your ZAPP files with `${variable-name}`. For example, define a variable here called `HLQ` with a value that represents your personal high-level qualifier on z/OS MVS. In your ZAPP file, reference it in a property group's location entry, such as `${HLQ}.COBOL.COPYBOOKs`.
- Fixed a copybook and include file watcher limitation about file precedence in remote and local non-syslib libraries.
- Added the user setting "zopeneditor.zowe.maximumParallelFileDownloads" to specify how many parallel downloads Z Open Editor should perform when requesting include files from MVS. This will help minimize address spaces being allocated by z/OSMF. The default value of the setting is 5, and the maximum value is 10. Set it to 1 to disable parallel downloads. ([Issue 134](https://github.com/IBM/zopeneditor-about/issues/134))
- Added the user setting "zopeneditor.zowe.listBeforeDownload" to enable Z Open Editor to first search for the existence of a data set member before trying to download it when resolving include files. This will slow down performance, but will cause less logging on z/OS when using z/OSMF. The default is off to preserve performance. ([Issue 134](https://github.com/IBM/zopeneditor-about/issues/134))
- Fixed the issue where COBOL copybook requests were not sent in parallel in certain cases where Unix-style line endings were used on Windows.
- Fixed the issue where COBOL and PL/I include file requests were sometimes sent twice if a document could not be found.
- Fixed the issue that language server errors and exceptions caused by a timing issue are displayed. ([Issue 332](https://github.com/IBM/zopeneditor-about/discussions/332))
- Fixed the issue where COPY or INCLUDE statements using custom libraries were in some cases resolved with syslib libraries.
- Improved the folder watching performance. When folders within the scope of the current ZAPP property groups are deleted or created, open program files will be re-parsed instead of a complete extension restart.
- Added the ability for user build to automatically run the `git check-attr` command in the background to evaluate `.gitattributes` in any folder of the workspace to upload files to UNIX System Services with the correct file encoding. If Git is not installed or cannot be found by the editor, Z Open Editor will continue trying to evaluate encoding itself. ([Issue 331](https://github.com/IBM/zopeneditor-about/issues/331))
- Fixed the issue in user build where files specified in a ZAPP file as `additionalDependencies` were not converted and tagged correctly when being uploaded to UNIX System Services.
- Fixed the issue where user build failed to run when `dbbLogDir` does not exist on UNIX System Services.
- Added a warning message to the user build output view to inform the user when the language server is stopped, because the language server will then not be able to compute dependencies such as copybooks and cannot upload them to z/OS.
- Fixed the issue where user build would not download any log files when the `logFilePatterns` property was not specified in the ZAPP file. Added a default that will download all files that match the pattern `*.log`.
- Fixed an issue where user build menu was not always hidden when user build was disabled via settings. ([Issue 347](https://github.com/IBM/zopeneditor-about/issues/347))
- Fixed an issue where ZAPP and ZCodeFormat code snippets would not show when editing in multi-root workspaces.
- Updated dependencies for security audits.
- Added support for JCL symbols as a parameter for jobs on RSE CLI.
- Fixed an issue when saving files to z/OS with Zowe Explorer using RSE API and resolving conflicts with changes done by other users to the same file. VS Code will now properly show the conflicts in its differences editor allowing you to merge and save.

## 3.1.1 - 2023/03/30

- Fixed an issue with COBOL language code completion where code completion was not working on the first line of a COBOL file.
- Added support for `$` and `<`/`>` to be used as pseudo-text boundaries for the REPLACING strings in COBOL copybooks. ([Issue 305](https://github.com/IBM/zopeneditor-about/issues/305))
- Fixed an issue where COBOL literals were not being highlighted correctly when single quotes and double quotes were mixed. ([Issue 308](https://github.com/IBM/zopeneditor-about/issues/308))
- Fixed an issue where the connection to the language server got disposed showing errors in the output view. ([Issue 332](https://github.com/IBM/zopeneditor-about/discussions/332))
- Fixed an issue where COBOL copybook requests did not download remote copybooks in parallel for non-syslib libraries.
- Fixed an issue with `.gitattributes` where `*` could not be used as a pattern for encoding the selection of files. ([Issue 331](https://github.com/IBM/zopeneditor-about/issues/331))
- Fixed an issue where the Zowe team configuration's encoding property was not used when no `.gitattributes` file was present or no match was found. ([Issue 331](https://github.com/IBM/zopeneditor-about/issues/331))
- Fixed an issue where user build on Windows uploaded remote copybooks to USS. ([Issue 333](https://github.com/IBM/zopeneditor-about/issues/333))
- Updated Zowe and third-party dependencies addressing security scan results.

## 3.1.0 - 2023/03/10

- Added support for the PL/I v6.1 October 2022 Refresh with updated syntax highlighting, outline view, real-time syntax checking, and other language related features. See this [blog post](https://community.ibm.com/community/user/ibmz-and-linuxone/blogs/di-hu1/2022/10/27/october-2022-documentation-refresh-for-enterprise) for details.
- Added support for using comma in the DEFINE compiler option syntax for COBOL. ([Issue 278](https://github.com/IBM/zopeneditor-about/issues/278))
- Added code completion support for statements containing Unicode Strings in COBOL.
- Added code completion support for Compiler Directing statements (Compiler Options) in COBOL.
- Added code completion support for `ENABLE PROGAM` in `EXEC CICS` Statements in COBOL.
- Fixed an issue with COBOL where CBL or PROCESS service directive was not being recognized. ([Issue 253](https://github.com/IBM/zopeneditor-about/issues/253))
- Fixed an issue with COBOL Language showing false syntax errors for not correctly handling condition expressions on compilation variables in boolean format compared with the constant b'0' or b'1'. ([Issue 321](https://github.com/IBM/zopeneditor-about/issues/321))
- Reverted syntax highlighting changes from last release for unsupported Boolean literals (`b` and `bx`). The IBM COBOL compiler currently does not support them. ([Issue 308](https://github.com/IBM/zopeneditor-about/issues/308))
- Added new option `alignToClauses` to `zcodeformat.yaml` files to support aligning TO clauses, aligning INTO clauses, and aligning TO clauses into column.
- Added file watching support for all languages so that programs with INCLUDE and COPY statements are now automatically re-parsed when local included files or copybooks are edited, created, or deleted. ([Issue 108](https://github.com/IBM/zopeneditor-about/issues/108)). See [Known Issues](https://ibm.github.io/zopeneditor-about/Docs/knownissues.html) for a limitation involving file precedence in remote and local non-syslib libraries.
- Improved performance for loading PL/I include files. Include files that are being downloaded from a remote z/OS system will now resolve much faster as download requests are performed in parallel to a maximum of five files at once. ([Issue 269](https://github.com/IBM/zopeneditor-about/issues/269))
- Significantly improved performance for searching for local copybooks and include files via property groups that use glob patterns that expand to many results. ([Issue 315](https://github.com/IBM/zopeneditor-about/issues/315), [Issue 293](https://github.com/IBM/zopeneditor-about/issues/293))
- Fixed an issue with no hover content of the copybook when COBOL source contains any errors in the COBOL program. ([Issue 300](https://github.com/IBM/zopeneditor-about/issues/300))
- Fixed a bug where large copybooks and include files were not completely resolved, resulting in errors such as `Unable to resolve reference` to variables included from copybooks. ([Issue 313](https://github.com/IBM/zopeneditor-about/issues/313))
- Fixed a bug when editing REXX programs with remote REXX include files, which were resolved and saved with an incorrect file extension.
- Full support for all the new Zowe Explorer JES filtering options when using RSE API profiles.
- Fixed issue where user build logs in nested directories were not being found ([Issue 296](https://github.com/IBM/zopeneditor-about/issues/296)).
- Updated the user build output view and log file formatter to include timestamps when Z Open Editor's log level (`zopeneditor.logger`) is set to `DEBUG` to help with trouble-shooting and measuring build times. ([Issue 292](https://github.com/IBM/zopeneditor-about/issues/292))
- Added support for path name specification for `.gitattributes` in user build.
- Added new option for tagging files using `working-tree-encoding os=zos` in `.gitattributes` in user build as an alternative to `zos-working-tree-encoding`.
- Addressed a concern that code snippets for ZAPP and ZCodeFormat files appeared in the code completion for all YAML files being edited. We therefore removed them from the Snippet Gallery and provided them as pure context-sensitive code completion items for `<ctrl-space>`.
- Z Open Editor is now available to install as a web extension with limited capabilities when using Visual Studio Code in a browser, such as `vscode.dev` or `github.dev`. Try it by going to <https://vscode.dev/github/IBM/zopeneditor-sample> and confirming to install the recommended extensions.

## 3.0.1 - 2023/01/18

- Performance improvements for loading COBOL copybooks. Copybooks that are being downloaded from a remote z/OS system will now resolve much faster as download requests are performed in parallel to a maximum of five files at once. PL/I will be updated with this capability in a later release. ([Issue 269](https://github.com/IBM/zopeneditor-about/issues/269))
- Fixed invalid "REDEFINES clause must begin in Area B" error shown in COBOL editor when using the REPLACING clause with a REDEFINES. ([Issue 287](https://github.com/IBM/zopeneditor-about/issues/287))
- Fixed issues with COBOL syntax highlighting when using literal delimiters. Respective language server fixes will be provided at a later date. ([Issue 308](https://github.com/IBM/zopeneditor-about/issues/308))
- Fixed spelling in COBOL code snippets. ([Issue 286](https://github.com/IBM/zopeneditor-about/issues/286))
- Fixed issue with `%Replace` in PL/I when using a minus sign in expression. ([Issue 299](https://github.com/IBM/zopeneditor-about/issues/299))
- Fixed an issue in user build evaluating file names with special characters, such as `$`, in command shell expression. The DBB Daemon might also be effected by this problem. Remove the `-DBB_PERSONAL_DAEMON` command line parameter from the ZAPP file if you still run into this problem. ([Issue 288](https://github.com/IBM/zopeneditor-about/issues/288))
- Fixed an issue with user build not downloading log files for programs with lower or mixed case filenames, because [dbb-zappbuild](https://github.com/IBM/dbb-zappbuild) will automatically capitalize log file names. user build will now also automatically capitalize the build file name when using the ${buildFile.basename} variable under logFilePatterns in the ZAPP file.
- Fixed syntax error in ZAPP code snippet for the dbb user build profile.
- Fixed issues in our RSE API support when using special characters in z/OS file or directory names.
- Fixed bugs and improved the usability of the change password command in the IBM RSE API Plug-in for Zowe CLI.
- Fixed error being thrown in Zowe Explorer when RSE API list of all members returns no members.

## 3.0.0 - 2022/11/22

### Breaking Changes

For more details on breaking changes and the required manual migration steps see our [user documentation](https://ibm.github.io/zopeneditor-about/Docs/zopeneditor_v3.html).

- Z Open Editor now requires as a minimum a Java 11 runtime for running language servers. Users must upgrade their installed Java 8 runtime or Z Open Editor's language capabilities will not be available. See the [documentation](https://ibm.github.io/zopeneditor-about/Docs/getting_started.html) for the recommend Java Runtime Environments that you can use.
- ZAPP files are now replacing various user settings and cannot be disabled enabled anymore. The user setting "zopeneditor.zapp.enabled" has been removed.
- Property Groups have been removed from VS Code user and workspace settings. The setting `"zopeneditor.propertygroups"` is no longer available. Users must now use ZAPP files for specifying locations for include files. When only using Zowe Explorer to edit program files you need create a workspace folder with a ZAPP file as well.
- Property Groups have been updated to contain references to local files as well as remote MVS files in the same property group item applying the same compiler options to each. The schema for a property group item has changed and users must update their ZAPP files. Please, check the [documentation](https://ibm.github.io/zopeneditor-about/Docs/setting_propertygroup.html) for the details and our [migration page](https://ibm.github.io/zopeneditor-about/Docs/zopeneditor_v3.html) for how to upgrade.
- user build settings have been updated to allow more configuration options such as allowing glob patterns to define files for uploading and downloading. See the [IBM Wazi for VS Code user build documentation](https://www.ibm.com/docs/en/cloud-paks/z-modernization-stack/2022.3?topic=code-building-cobol-pli-hlasm-programs-user-build) for more details.

### Other changes and fixes

- Fixed syntax of `EXEC CICS INQUIRE SYSTEM MAXOPENTCBS`. ([Issue 257](https://github.com/IBM/zopeneditor-about/issues/257))
- Added missing CICS v6.1 `INQUIRE SYSTEM` options: `SRRTASKS`, `MEMLIMIT` and `MQCONN` that used to cause syntax errors.
- Fixed CICS v6.1 `EXEC CICS CREATE DB2ENTRY ATTRIBUTES` option incorrectly flagged as an error.
- Fixed CICS v6.1 `EXEC CICS SET TAGS REFRESH` with `NOHANDLE` and `RESP` options incorrectly flagged as an error.
- Fixed an issue in COBOL syntax checking for a working storage variable starting with `REMARKS`. It would be incorrectly identified as a REMARKS paragraph. ([Issue 276](https://github.com/IBM/zopeneditor-about/issues/276))
- Fixed an issue with COBOL Syntax Highlighting in the sequence number fields (1-6 and 73-80). ([Issue 193](https://github.com/IBM/zopeneditor-about/issues/193))
- Fixed a NullPointerException caused by the PL/I Code Folding feature when opening copybook/include file from PL/I Editor. ([Issue 277](https://github.com/IBM/zopeneditor-about/issues/277))
- Fixed a NullPointerException caused by the PL/I Code Folding feature when the currently selected word matches a code completion suggestion that would alter the outline view. ([Issue 283](https://github.com/IBM/zopeneditor-about/issues/283))
- Fixed an issue with syntax checking for PL/I related to function parameters of type File as well as a `DEFINE ORDINAL` containing signed integers in the VALUE attribute.
- Added REXX syntax highlighting for matching pairs of parenthesis. Auto-close parenthesis when typing.
- Fixed an issue with improper error logging regarding the list command in RSE CLI.

## 2.2.0 - 2022/09/20

- Fixed user build and the RSE API CLI's upload command to correctly encode file names with special characters. Files such as "T@A#R$C" will now be correctly uploaded to USS. ([Issue 266](https://github.com/IBM/zopeneditor-about/issues/266))
- Performance improvements for the REXX language server via parser optimizations. ([Issue 256](https://github.com/IBM/zopeneditor-about/issues/256))
- Updated the REXX hover hyperlinks to point to the z/OS 2.5.0 reference.
- Performance and reliability improvements for the HLASM language server by implementing cancellation support for requests that are no longer valid as well as optimizing handling of document-link requests for macros.
- Fixed a bug where mixed case variables were not handled correctly in HLASM.
- Fixed a bug where hovers sometimes did not show the correct code snippet for SYS1.MACLIB macros in HLASM.
- Fixed a bug where document link underlines were not showing for HLASM macros when a file is first opened. Similar to a problem fixed for COBOL in ([Issue 81](https://github.com/IBM/zopeneditor-about/issues/81)) and ([Issue 114](https://github.com/IBM/zopeneditor-about/issues/114)).
- Fixed a bug where "Failed to fetch COPYBOOK" errors were causing slowdowns across the HLASM language server.
- Added initial support for code folding for control statements to the PL/I language server.

## 2.1.1 - 2022/08/04

- Added support for running user builds with nested copybooks for COBOL. ([Issue 251](https://github.com/IBM/zopeneditor-about/issues/251))
- Fixed user build issues with credential dialogs and storing credentials for remote include file resolution using z/OSMF or RSE API. ([Issue 245](https://github.com/IBM/zopeneditor-about/issues/245), [Issue 255](https://github.com/IBM/zopeneditor-about/issues/255))
- Fixed user build issues with credential dialogs and storing credentials for SSH commands when using z/OSMF.
- Fixed user build issues when attempting to build from workspaces with spaces in the file path. ([Issue 252](https://github.com/IBM/zopeneditor-about/issues/252))
- Fixed various issues when using ZAPP and user build in a multi-root workspace. You can now use multi-root workspaces as long as you use a single ZAPP file and provide it together with the application-conf folder in the same workspace as your program. Include files such as copybooks can be in many other multi-root workspace folders. The ZAPP file needs to specify property groups with a workspace folder relative path even for include files located in other workspaces. user build with user settings in multi-root workspaces is not supported. Please, switch to ZAPP files. See our [Sample GitHub repository](https://github.com/IBM/zopeneditor-sample) for more details and a examples for single-root workspaces, in the `wazi-main` branch as well as multi-root in the `multiroot` folder of the `wazi-main` branch. Also note, that for single as well as multi-root the value for the DBB `buildScriptArgs` parameter has changed for the `--application` parameter to be now just a relative path to the application-conf directory. So in most cases you can just use `--application .`, which makes it much easier as you do not have to provide the folder name of your workspace root in the ZAPP file anymore. Finally, the `zopeneditor.userbuild.userSettings.localWorkspacePath` user setting has been deprecated is not used anymore.
- Fixed an issue in the Z Open Editor output log not always reporting the correct Zowe profile management version in use.
- Fixed issue in the COBOL Code Formatter producing incorrect Area B alignments for USING statements.

## 2.1.0 - 2022/06/14

- Added language support for COBOL v6.4, PL/I v6.1, and CICS v6.1 with updated syntax highlighting, outline view, real-time syntax checking, and other language related features. See our [documentation](https://ibm.github.io/zopeneditor-about/Docs/language_references.html) for details. ([Issue 240](https://github.com/IBM/zopeneditor-about/issues/240))
- Added COBOL UTF-8-specific syntax elements in textmate grammar. ([Issue 241](https://github.com/IBM/zopeneditor-about/issues/241))
- Added an experimental COBOL code formatter that can be configured similar to Prettier with a yaml or json file. Find more details in our documentation. ([Issue 31](https://github.com/IBM/zopeneditor-about/issues/31))
- Updated HLASM Instructions to match the set that was shipped with IBM z16.
- Updated HLASM Macros to match the z/OS 2.5 SYS1.MACLIB. Switch the z/OS version back to 2.4 SYS1.MACLIB by using the user setting `zopeneditor.hlasm.zosMacrosVersion`.
- Added `.macasm` and `.copyasm` as default file extensions for HLASM. ([Issue 220](https://github.com/IBM/zopeneditor-about/issues/220))
- Added `.bms` as default file extensions for HLASM. ([Issue 223](https://github.com/IBM/zopeneditor-about/issues/223))
- Fixed an error in the Problems View when a custom-defined problemMatcher was used when compiling HLASM code. ([Issue 230](https://github.com/IBM/zopeneditor-about/issues/230))
- Various fixes and refinements for HLASM syntax highlighting.
- Added REXX include file support consistent with the other languages using Property Groups in ZAPP files. ([Issue 172](https://github.com/IBM/zopeneditor-about/issues/172))
- Added a status bar item that displays the currently active Zowe profile used by Z Open Editor for remote include file resolution and user build. ([Issue 165](https://github.com/IBM/zopeneditor-about/issues/165))
- Added support to filter the information displayed in the RSE CLI plugin command `zowe rse check jobs` that displays all active job address space information. This functionality is available in RSE API v1.0.9.
- Added support for use of passphrase in `change password` command with RSE API v1.0.9.

## 2.0.3 - 2022/05/20

- Fixed a synchronization issue that when saving syntactically correct ZAPP files the editor sometimes would still report errors.
- Fixed an issue in user build related to file upload operations in which Z Open Editor would not evaluate the .gitattributes file correctly, not following the Git standard for precedences. ([Issue 236](https://github.com/IBM/zopeneditor-about/issues/236))
- Updated how user build parses .gitattributes files dealing with more file formats such as Windows CRLF files and added more logging for the encoding matches found or not found. ([Issue 235](https://github.com/IBM/zopeneditor-about/issues/235))
- Added support for using the `ZOWE_CLI_HOME` environment variable to specify an alternative location for global team configuration files to Zowe Explorer 2.0.2 and Z Open Editor. ([Issue 238](https://github.com/IBM/zopeneditor-about/issues/238))
- Fixed various errors that prevented Zowe Explorer and Z Open Editor to run in Eclipse Che especially plugin containers with Nodejs 12. You can use these extensions now with secure credentials disabled as [documented here](https://ibm.github.io/zopeneditor-about/Docs/zowe_explorer_v2.html#eclipse-che).

## 2.0.2 - 2022/04/25

- Added full support for Zowe 2.0 in particular Zowe Explorer 2, Zowe CLI 7, Zowe API Mediation Layer 2. You can continue using your Zowe CLI 6.x profiles for backwards compatibility, but you must update Zowe Explorer to version 2 to do so. Review our Getting Started with Zowe 2.0 section in the Z Open Editor user documentation or the Zowe CLI documentation for how to migrate your 6.x profiles to the 7.x format.
- Added support for `auto-init` of Team config files to the IBM RSE API Plugin for Zowe CLI. Use it when you have you RSE API host component registered with the API Mediation Layer.
- Switched the minimal required version of Node JS for IBM RSE API Plugin for Zowe CLI to version 14 as version 12 is out of support now.
- Added user setting `zopeneditor.server.startupOptions` for providing custom Java startup options for language servers. Can be used with tech support for troubleshooting.

## 2.0.0 - 2022/03/15

Z Open Editor is released as major version update to 2.0 to celebrate its availability in IBM Wazi Developer for Workspaces 2.0 that is now part of the IBM Z and Cloud Modernization Stack and fully supports running on OpenShift on Linux on Z. Note that because Zowe 2.0 was delayed to late April 2022, Z Open Editor has to be updated to support it once Zowe has been released. Other fixes and enhancements in this release:

- Added missing DEBUG-ITEM variables in the COBOL language server. ([Issue 156](https://github.com/IBM/zopeneditor-about/issues/156))
- Added missing JNIENVPTR and JSON-STATUS variables in the COBOL Textmate grammar and the COBOL language server. ([Issue 156](https://github.com/IBM/zopeneditor-about/issues/156#issuecomment-912978046))
- Fixed an issue in the COBOL language server not supporting a mixed case spelling of SQLCA and SQLDA. ([Issue 208](https://github.com/IBM/zopeneditor-about/issues/208))
- Fixed an issue in the COBOL language server where the Rename Symbol feature was not renaming symbols that were spelled using a different character casing.
- Fixed an issue in the COBOL Textmate Grammar making the SCREEN keyword case insensitive.
- Fixed an issue in the COBOL language server where parsing failed because of period in column 72 and standard sequence numbering present in the program. ([Issue 202](https://github.com/IBM/zopeneditor-about/issues/202))
- Fixed an issue in the COBOL Language Sever where parsing failed with invalid error message in COPY REPLACING statements. ([Issue 181](https://github.com/IBM/zopeneditor-about/issues/181))
- Performance and reliability improvements for the COBOL and PL/I language servers by implementing cancellation support for requests that are no longer valid as well as optimizing handling of document-link requests for include files.
- Added new options to the truncation warning dialog for COBOL, PL/I, HLASM, REXX, and JCL files in Z Open Editor. Also, if only whitespaces would be truncated then the editor will not prompt anymore and just remove these automatically.
- Fixed an issue in the PL/I language server where hover content for include files were not rendering in the correct format. ([Issue 211](https://github.com/IBM/zopeneditor-about/issues/211))
- Fixed an issue in the HLASM language server where NullPointerException were logged while rendering hovers after a document change.
- Fixed an issue where HLASM syntax highlighting was not correctly recognizing sequence numbers at the end of lines. ([Issue 192](https://github.com/IBM/zopeneditor-about/issues/192)).\
- Fixed an issue in the REXX language server where a trailing comma in a function parameter resulted in a syntax error.
- Improved the REXX language server performance and stability when editing large files.
- Z Open Editor and Zowe Explorer now share the profiles loaded into memory via the Zowe Explorer Extensibility API. If you now make changes to a profile in Zowe Explorer or use the Reload button to load changes from disk done via CLI, then changes will be immediately visible to Z Open Editor without the need to run "Reload Zowe profiles" from the command palette. This command now performs the same operation as clicking the Zowe Explorer Refresh button.
- Made the Zowe connection test in Z Open Editor more robust and fixed the issue of tests timing out for slow connections. ([Issue 197](https://github.com/IBM/zopeneditor-about/issues/197))
- Fixed an issue preventing submission of JCL in Zowe Explorer via command palette option "Zowe Explorer: Submit JCL" using RSE API CLI Zowe profiles.
- Fixed an issue with token and base Zowe CLI profiles support for MVS connection tests for remote file resolving.
- Added RSE API Zowe profile login and logout support for JSON Web Token authentication with the RSE API through Zowe Explorer.
- Improved working with interactive TSO commands for RSE API Zowe profiles by adding the TSO command tag `shell-id`, that can be used with RSE API server v1.0.8.
- user build now works with Zowe CLI profiles that do not store credentials. User will be prompted to provide them when the build starts.
- Adopted the latest version of [dbb-zappbuild](https://github.com/IBM/dbb-zappbuild) for user build that now considers file tags for processing. The JSON dependency file will now be uploaded as a UTF-8 file. If you are using an older version of dbb-zappbuild, please update with the latest changes from its main branch on GitHub.
- Fixed an issue that would show the command `user build: Run user build` for files with unsupported languages in the command palette.
- Fixed an issue that prevented recognizing ZAPP files running in Eclipse Che when workspaces folders were added or removed.
- Reviewed and revised multiple user interface strings and dialogs.
- Updated code samples in <https://github.com/IBM/zopeneditor-sample/tree/wazi-main> with Ansible playbooks and host variables for IBM Wazi Sandbox and the IBM Wazi as a Service tutorials.

## 1.4.1 - 2021/11/19

- Fixed an issue with COBOL syntax highlighting of reference modifications ([Issue 177](https://github.com/IBM/zopeneditor-about/issues/177))
- Fixed the VS Code Toggle Line Comment (Cmd-/ or Ctrl-/) command for COBOL. You can now use it with the cursor being placed anywhere in the line as well as select a whole block of code and set or remove the comment symbol as a toggle. ([Issue 157](https://github.com/IBM/zopeneditor-about/issues/157))
- Fixed several issues with HLASM syntax highlighting related to continuation lines, macro definitions, and substitution characters. ([Issue 118](https://github.com/IBM/zopeneditor-about/issues/118), [Issue 185](https://github.com/IBM/zopeneditor-about/issues/185)). See our [Known Issues](https://ibm.github.io/zopeneditor-about/Docs/knownissues.html) page for problems not solved, yet.
- Fixed various inconsistencies with the HLASM outline view. It will now show the first occurrences of CSECTs, DSECTs, MACROs, Branch Targets, and Labels. ([Issue 148](https://github.com/IBM/zopeneditor-about/issues/148)). See our [Known Issues](https://ibm.github.io/zopeneditor-about/Docs/knownissues.html) page for problems not solved, yet.
- Enhanced HLASM outline view to now display all labels. See [Customizing the outline view](https://ibm.github.io/zopeneditor-about/Docs/customizing_the_outline_view.html) to change what is included in the outline view.
- Added support to use all REXX keywords as variables, excluding the 'END' keyword as well as improved the readability of keyword-related syntax error messages.
- Fixed an issue in which trying to load remote include files from MVS using an invalid Zowe CLI Profile password could lock user accounts due to too many failed attempts. Z Open Editor will now prompt for a new password to update the profile or allow canceling all requests. This fix also adds support for using Zowe CLI profiles that do not store credentials and you will be prompted when required. ([Issue 142](https://github.com/IBM/zopeneditor-about/issues/142))
- Fixed an issue that prevented switching from Z Open Editor language servers to other languages. ([Issue 164](https://github.com/IBM/zopeneditor-about/issues/164))
- Fixed an regression in which a ZAPP file was not found when using it in an IBM RSE API for Zowe CLI command parameter or in Z Open Editor when specifying a file with zopeneditor.zowe.defaultRseConversionMappingsFile that was not in the current workspace.
- Fixed an issue with user build where dependencies would not upload again after making a change inside VS Code settings or ZAPP file.
- Fixed an issue with user build where remote dependencies were being uploaded on Windows.
- Enhanced user build messages to be more informative and actionable.
- Fixed security related logging issue.

## 1.4.0 - 2021/10/29

- You can now use user build without SSH when using IBM RSE API for Zowe CLI profiles. SSH Zowe CLI profiles are now required by z/OSMF only.
- user build speed is increased by sending additional dependency and metadata information to IBM Dependency Based Build on z/OS. Check the documentation for new dbb-zappbuild build script arguments.
- When you save user or workspace settings, Z Open Editor will recognize and reload all Zowe CLI profiles, which is particularly useful when you add new profile names to the `zopeneditor.zowe` setting.
- Support for ZAPP files with Z Open Editor is now also available when running in Eclipse Che, Red Hat CodeReady Workspaces, and IBM Wazi Developer for Workspaces.
- Startup performance is faster with a smaller memory footprint due to significantly reduced language server sizes.
- You can use the IBM Debug for z/OS High Level Assembler debug listing files with the language ID `hlasmlst` and the default file extension `langx`.
- Fixed an issue in which a newly created ZAPP file was not recognized until the editor restarted.
- Enhanced some UI strings for effectiveness including menus and Preferences names and descriptions.
- New commands are added to IBM RSE API for Zowe CLI:
  - `zowe rse create data-set --like`: Allocates a new data set with the same attributes as an existing data set specified by the `--like` option in IBM RSE API for Zowe CLI. The allocate-like functionality can now also be used with RSE profiles in Zowe Explorer. To use this feature, RSE API server 1.0.7 or later versions are required.
  - `zowe rse check system-address-space`: Displays all active system address space information in RSE CLI plug-in. To use this feature, RSE API 1.0.5 or later versions, and IBM Explorer for z/OS 3.2.0.16 or later versions are required.
  - `zowe rse check job-address-space`: Displays all active job address space information in RSE CLI plug-in. To use this feature, RSE API 1.0.5 or later versions and IBM Explorer for z/OS 3.2.0.16 or later versions are required.

## 1.2.7 - 2021/09/21

- Security fixes for third party dependencies.
- Fixes a bug related to reporting telemetry data.

## 1.2.6 - 2021/08/19

- Fixed an issue with PL/I compiler options for margins not being interpreted correctly in the editor. ([Issue 135](https://github.com/IBM/zopeneditor-about/issues/135))
- Fixed an issue that encoded special characters incorrectly in include file hovers for all languages. ([Issue 128](https://github.com/IBM/zopeneditor-about/issues/128))
- Fixed issues with HLASM code completion not appearing correctly in continuation and empty lines. ([Issue 118](https://github.com/IBM/zopeneditor-about/issues/118))
- Various fixes and improvements for REXX:
  - Fixed issues with handling multi-line strings correctly for REXX.
  - Made code completion in REXX case-sensitive in the sense that it preserves the casing style the user was using before initiating a completion requests with `Ctrl-Space`.
  - Added an editor ruler at column 80 in REXX files. All editor rulers are customizable through the settings.
  - Added truncation warnings for characters after column 80 in REXX files. The column number is customizable through the settings.
  - Various REXX refinements that improve stability and performance of parsing and error messages.
- Fixed an issue in IBM RSE API for Zowe CLI that prevented the use of the correct encoding for file uploads to USS, which also impacted uploads via Zowe Explorer using an RSE API profile. This fix requires Zowe Explorer 1.18.0 or newer.
- Fixed an issue in user build that prevented the use of the correct encoding as defined in .gitattributes to files uploaded via z/OSMF or RSE API profiles.
- Addressed the user request to allow the `zopeneditor.zowe` settings to be scoped for workspace settings. This will be useful for development teams who standardize the names of their Zowe CLI profiles for their projects and use them for build automation. ([Issue 143](https://github.com/IBM/zopeneditor-about/issues/143))
- Adopted the new of Zowe Explorer's `zowe.files.temporaryDownloadsFolder.cleanup` setting to support the use of multiple VS Code windows showing the same files opened via Zowe Explorer so you can see different parts of the same program on two different screens. Note, that disabling the cleanup will result in files downloaded from z/OS not being removed when the editor is closed or restarted. That can lead to the effect that when you open a file via Zowe Explorer that you might look at an outdated local version. Use the right-click "Pull from Mainframe" command to ensure you are working with the latest.
- Adopted new Zowe Explorer APIs that require Zowe Explorer 1.15.0 or newer to be installed. This release has beed tested with Zowe Explorer 1.18.0.

## 1.2.5 - 2021/06/18

- Refined COBOL Renumber and Unnumber support making it configurable to work with columns 1-6 or 73-80 or both. If content other than numeric values is already present in these locations in a specific row then it will not update that location to preserve the content. ([Issue 8](https://github.com/IBM/zopeneditor-about/issues/8))
- Fixed syntax highlighting for HLASM beyond column 16. There is still an issue with code completion that well be addressed in a later release. ([Issue 118](https://github.com/IBM/zopeneditor-about/issues/118))
- Improved performance and reliability of downloading larger numbers of include files such as SYS1.MACLIB macros for the HLAMS editor hovers.
- Removed the performance warning dialog for property groups and replaced it with log messages ([Issue 15](https://github.com/IBM/zopeneditor-about/issues/115))
- user build now writes its output into a separate log file for users to share and analyze.
- Adoption of new Zowe Explorer API ICommand to allow issuing of TSO commands using RSE profiles via Zowe Explorer 1.14.0 and higher.
- RSE CLI plug-in updates:
  - RSE CLI plug-in now prompts user for credentials for RSE profiles without user and password, during `zowe rse auth login` command to obtain JWT token, and if RSE API token is expired to obtain new token.
  - Fixed a regression that broke uploading a file as a sequential data set.

## 1.2.1 - 2021/04/21

- Made various improvements to our REXX language server and fixed defects:
  - Added support for nested comments in REXX.
  - Added support for keyword instructions as variables in REXX (excludes DO, IF, PARSE, SELECT, TRACE).
  - Fixed a find references bug in REXX where variables and functions with the same name matched.
  - Fixed a find references bug in REXX where keywords could be used to find references.
  - Refined the hover content and code completion detail in REXX to make the information more concise.
  - Updated the hover content IBM Knowledge Center links to point to the new IBM Docs pages for the z/OS 2.4.0 TSO/E REXX Reference.
  - Standardized the syntax highlighting in REXX to color all keywords the same.
  - Fixed a syntax highlighting bug in REXX where "value" following "address" was not coloring as a keyword.
  - Fixed a syntax highlighting bug in REXX where the routine name following "call" was not coloring as a function.
- Reviewed and updated all our output and log messages for the IBM RSE API Plugin for Zowe CLI making them more consistent. As always, find the log file in `~/.zowe/zowe/logs/zowe.log`.
- Updated our RSE API support for Zowe CLI [base profiles](https://docs.zowe.org/stable/user-guide/cli-usingcli.html#base-profiles) for the [Zowe API Mediation Layer (API ML)](https://docs.zowe.org/stable/user-guide/api-mediation/discovery-service-configuration.html#api-ml-configuration) Single Sign On (SSO) for user build and using the RSE API behind the Zowe API ML. Also, see this [new blog post](https://community.ibm.com/community/user/ibmz-and-linuxone/blogs/joe-winchester1/2021/04/14/using-the-ibm-remote-system-explorer-apis-with-the) for an overview for how to use RSE API with the Zowe API Mediation Layer.

## 1.2.0 - 2021/03/19

- REXX Language Server: in this release we add language support for TSO/E REXX for z/OS. This first version includes syntax highlighting, syntax errors, code completion, find references, outline view, and rich documentation hover features. See our docs for all the details. ([Issue 14](https://github.com/IBM/zopeneditor-about/issues/15))
- Added full support for encoding conversions to/from UTF-8 to/from international EBCDIC code pages for all our z/OS MVS interactions that use RSE API
  - Introduced a new mapping file concept to ZAPP as well as standalone JSON files that allow specifying mappings to groups or individual data sets or even members.
  - Added support for all RSE API CLI commands with new parameters as well as the ability to read mapping files that read and write to MVS.
  - All Z Open Editor remote MVS read operations using RSE API to find include files now can use mappings defined in ZAPP or user-local mappings files.
  - The Zowe Explorer integration with RSE API can also be configured to use mappings files for read and write operations of data set members.
- Added EBCDIC conversion mappings for z/OS USS to user build. Users can provide a standard .gitattributes file that specifies the encoding the program files should be converted to when uploaded to z/OS USS for a build.
- Added context menus for COBOL with the ability to remove as well as renumber sequence numbers. ([Issue 8](https://github.com/IBM/zopeneditor-about/issues/8))
- Made include file resolution case-insensitive by default to support users with lowercase filenames and property group path names on local case-sensitive file systems such as Linux. As this can lead potentially to ambiguity problems we also added a new user setting called `zopeneditor.enforceCaseSensitiveIncludeFileNames` to enable case sensitive matching, even on case-insensitive operation systems such as Windows.
- The command `Reload Zowe Profiles` that you can use when you changed your Zowe profiles, which was mainly introduced for user build, now also restarts the Language Servers and retries loading any remote MVS include files with the updated profile information.
- Added a new Welcome page for new users that interactively checks for prerequisites and gives tips for getting started.
- Added support for APIML SSO for remote include file resolution such as COBOL Copybooks located on MVS. ([Issue 107](https://github.com/IBM/zopeneditor-about/issues/107))
- Fixed an issue in which invalid Zowe CLI profile configurations could cause Z Open Editor to not activate. We now show error messages and the editor is still usable. ([Issue 110](https://github.com/IBM/zopeneditor-about/issues/110))

## 1.1.3 - 2020/12/12

- Fixed regression when resolving copybooks/include files with property groups that have multiple syslib/library entries. ([Issue 105](https://github.com/IBM/zopeneditor-about/issues/105))

## 1.1.2 - 2020/12/09

- Added support for SYS1.MACLIB macros to HLASM for code completion. If you have a valid Zowe Explorer connection it will even retrieve the macro definition automatically once you typed/code completed the macro name and show it to you in rich hovers. (Needs to be enabled in user settings.)
- Improved the way Z Open Editor is looking for your Java Runtime or SDK. Review our updated documentation for the search order in which it tries to locate Java, as well as how you can override it with user settings. Added official support for Java Runtimes, not requiring an SDK anymore.
- RSE API CLI has added an encoding field that you can specify when creating or editing a Zowe RSE API CLI profile. This field will be used with newly added encoding tags for upload and download commands for MVS and USS files. Resolving copybooks will now use this encoding tag as well for RSE API as well as z/OSMF connections. ([Issue 82](https://github.com/IBM/zopeneditor-about/issues/82))
- RSE API Zowe CLI now supports MVS binary downloads. ([Issue 58](https://github.com/IBM/zopeneditor-about/issues/58))

To update the IBM RSE API Plugin for Zowe CLI to v1.1.2 follow [the instructions here](https://ibm.github.io/zopeneditor-about/Docs/setup_integration.html#updating-the-ibm-rse-api-plug-in-for-zowe-cli) for the optional migration.

## 1.1.1 - 2020/11/5

- Added full support for [Zowe CLI Base Profiles](https://docs.zowe.org/stable/user-guide/cli-usingcli.html#base-profiles) with [RSE API JWT tokens](https://ibm.github.io/zopeneditor-about/Blog/rse-october-110.html#use-json-web-tokens-jwt-for-authentication-with-the-host) for CLI commands and well as Zowe Explorer 1.10.1 or newer. To use it also update the IBM RSE API Plugin for Zowe CLI 1.1.1 and follow [the instructions here](https://ibm.github.io/zopeneditor-about/Docs/setup_integration.html#updating-the-ibm-rse-api-plug-in-for-zowe-cli) for the optional migration.
- Fixed issue for specifying the right PL/I margin with property groups compile option settings. Note, that the left margin must be at least 2 at the moment. ([Issue 72](https://github.com/IBM/zopeneditor-about/issues/87))
- Added [new documentation](https://ibm.github.io/zopeneditor-about/Docs/setting_compiler_options.html) for the currently supported property group compile options.
- Fixed issue with using `$`, `#`, or `@` in HLASM and PL/I include file names. COBOL will be addressed in a future release. ([Issue 86](https://github.com/IBM/zopeneditor-about/issues/86))

## 1.1 - 2020/10/23

- ZAPP (Z APPlication) file support. Instead of mixing the configuration of your application with VS Code Preferences you can now specify property groups and user build configurations in a new simple yaml (or json) file located in your workspace that you can share with your team in Git. See our docs for a tutorial.
- Added support for the Zowe CLI Secure Credentials Plugins for all Z Open Editor operations such as resolving include files or running user build ([Issue 66](https://github.com/IBM/zopeneditor-about/issues/66))
- Property Groups can now be scoped to one specific language making include file resolution more efficient as well as to support compiler options. ([Issue 72](https://github.com/IBM/zopeneditor-about/issues/72)).
- Added the ability to provide language-specific compiler options such as `OR('!'), MARGINS(2,120)` to property groups to configure the editor ([Issue 17](https://github.com/IBM/zopeneditor-about/issues/17), [Issue 61](https://github.com/IBM/zopeneditor-about/issues/61)).
- Include file resolution for COBOL and PL/I ignores SQLCA and SQLDA ([Issue 71](https://github.com/IBM/zopeneditor-about/issues/71)).
- Fixed issues with COBOL 6.3 support such as `>>if >>else >>end-if` ([Issue 65](https://github.com/IBM/zopeneditor-about/issues/65)).
- The logger now provides more configuration information that will help in your interactions with tech support.
- Fixed issues managing Zowe Explorer favorites when using RSE API.
- Revised profile validation in Zowe Explorer when using RSE API.

We now include the user build VS Code Extension in IBM Z Open Editor. Changes since the 1.0.0 release:

- In addition to COBOL we added support for building PL/I and HLASM programs with IBM Dependency-Based Build.
- Fixed an issue with corrupted DBB log files when downloaded from USS.
- user build menus no longer appear for remote MVS or USS files opened via Zowe Explorer to avoid confusion about what can be built and what cannot.
- Added more detailed log messages in the user build Output window, such as the full ssh commands executed, as a summary of all the user and workspace settings being used for a build and more. The output will list all required and optional settings and their values before the user build script is executed. If any required settings are missing, user build will stop execution explaining which setting caused the problem.
- user build can now run with files that contain spaces in their paths.

## 1.0.4 - 2020/09/08

- Fixes in Notices file.

## 1.0.3 - 2020/08/07

- Added support for specifying custom include file extensions. You can now use the IBM Z Open Editor Preferences page to add and remove the file extensions to be used when searching for local include files such as COBOL copybooks. Also consistently added the Data Sets settings for remote include files to the visual editor allowing users to remove the mappings they do not want mapped in the files.association setting ([Issue 16](https://github.com/IBM/zopeneditor-about/issues/16)).
- Added branch targets to the HLASM Outline view.
- Fixed COBOL syntax highlighting that uses a "/" character for comments ([Issue 60](https://github.com/IBM/zopeneditor-about/issues/60)).
- Fixed HLASM syntax highlighting for macros starting with a "\$" character ([Issue 69](https://github.com/IBM/zopeneditor-about/issues/69)).
- Added a support for using the `java.home` user setting for developers that install VS Code with the [Microsoft Installer of VS Code for Java developer](https://code.visualstudio.com/docs/java/java-tutorial#_setting-up-visual-studio-code-for-java-development) or the Java Extension Pack.
- Added a Zowe Profile validation routine that is called when adding and using RSE API profiles with Zowe Explorer 1.7 or newer.

## 1.0.2 - 2020/06/30

- Merged v0.5.2 with v1.0.1 to publish v1.0.2 to the VS Code Marketplace that now includes the language server for IBM High-Level Assembler (HLASM) for z/OS 2.4.
- Reorganized the language server packaging to reduce the size of the extension to less than half than it was before.

## 0.5.2/1.0.1 - 2020/06/23

- Fixed false positives in Java compatibility check that prevented newer Java SDK versions than 8 to be used. ([Issue 57](https://github.com/IBM/zopeneditor-about/issues/57))

## 1.0.0 - 2020/06/12

- This is our v1.0 release for which you will be able to purchase technical support from IBM.
- Added a language server for IBM High-Level Assembler (HLASM) for z/OS 2.4.

## 0.5.0 - 2020/06/12

- Added syntax error checking for COBOL Copybooks.
- Added support for CICS 5.6 syntax.
- Rewrote the algorithm for searching for remote include files using Zowe CLI profiles.
- Added user settings for specifying which Zowe CLI profile to use for finding remote include files on MVS in case you use multiple z/OSMF or RSE API CLI profiles.
- Added Logger to analyze issues. Switch it on in the IBM Z Open Editor VS Code Preferences under User Settings.
- Fixed bug with Unreachable Code Detection in COBOL EXEC SQL statements and switched default of the `"zopeneditor.cobol.enableUnreachableCodeWarnings"` Preferences setting back to true. ([Issue 18](https://github.com/IBM/zopeneditor-about/issues/18))
- Updated LSP4J language servers to baseline v0.9.0 and VS Code language clients to v6.1.3.
- Improved LSP startup times.
- Added more Java runtime checks to ensure you are using a valid Java SDK with the Z Open Editor extension.
- Various enhancements and fixes for RSE API support such as Get JCL from the Zowe Explorer JES view as well as Migrate/Recall from the Zowe Explorer MVS view.
- Fixed rare race condition when starting language servers. ([Issue 45](https://github.com/IBM/zopeneditor-about/issues/45))
- Various stability fixes and refinements.

## 0.4.9 - 2020/04/23

- Fixed an issue when using RSE for the Zowe Explorer JES view.
- Fixed errors messages users saw when creating z/OSMF profiles in Zowe Explorer when Zowe CLI and/or the IBM RSE API Plugin for Zowe CLI was not installed.

## 0.4.7 - 2020/03/27

- Added Beta-level support for the new Remote System Explorer API (RSEAPI) REST servers that can be used as an alternative to z/OSMF for remote file operations as well as Zowe Explorer visual explorer views. If you run RSE already for IBM Developer for Z or IBM z/OS Explorer you can simply update. Go to <https://ibm.github.io/zopeneditor-about> for more details.
- Reduced the memory consumption of the extension by starting language servers only if a program in a specific language is opened for the first time. This will avoid that you are wasting valuable PC memory for languages that you do not use. In addition we added two optional commands that you can run to pause the COBOL or PL/I language server once you finished with one language and want to free up its memory. When you open a program of that language again the language server will restart.
- Added code actions that provide suggestions for resolving COBOL copybooks and PL/I include files by linking to Online Help pages.
- Removed MQ code templates for now as we ran into some language compatibility issues.

## 0.4.5 - 2020/01/07

- Added an additional 27 code snippets for MQ development with COBOL and 27 for MQ with PL/I.

## 0.4.3 - 2019/12/18

- Added more code snippets for COBOL, PL/I and JCL, which brings it to a total of 186. For COBOL we now provide 27 General COBOL language support snippets, 12 Embedded SQL snippets, 29 for CICS, 12 for IMS, and 8 for VSAM. Similarly, we provide for PL/I 12 General PL/I language support snippets, 29 CICS, 11 IMS, and 7 VSAM. Finally, we have 27 code snippets for JCL.

## 0.4.1 - 2019/11/21

- Language Server updates to support IBM Enterprise COBOL v6.3 and PL/I v5.3.
- Added all new sets of IBM field contributed code snippets for COBOL embedded SQL and CICS, PL/I embedded SQL, and various new JCL snippets. This is just the beginning of us curating a larger portfolio of high-value code snippets and incrementally releasing these in the coming months. Keep and eye out and [let us know what you think of these snippets](https://github.com/IBM/zopeneditor-about/issues).
- Added an import command for loading Code Snippets exported by the IBM Developer from z/OS. Do you have your own set of code snippets that you managed in the Snippets view in IDz? You can now export and import these into Z Open Editor.
- Switched off COBOL Unreachable Code warnings by default as there are cases in which it can provide false positives ([see here](https://ibm.github.io/zopeneditor-about/Docs/knownissues.html#limitations-of-cobol-program-files) for details). If you can accept the risk of a few false reports then you can enable it again by using the `"zopeneditor.cobol.enableUnreachableCodeWarnings": true` VS Code user or workspace setting.
- Fixed a code completion bug for COBOL and PL/I that would erase text to the right of the cursor.
- Fixed cases in which COBOL statements before the IDENTIFICATION DIVISION would break syntax checking. ([Issue [#9](https://github.com/IBM/zopeneditor-about/issues/9)](https://github.com/IBM/zopeneditor-about/issues/9))
- Fixed exceptions thrown by the PL/I LSP when computing document links ([Issue [#13](https://github.com/IBM/zopeneditor-about/issues/13)](https://github.com/IBM/zopeneditor-about/issues/13))
- Fixed issues with COBOL Unreachable Code warnings not being shown at all in some cases. ([Issue [#7](https://github.com/IBM/zopeneditor-about/issues/7)](https://github.com/IBM/zopeneditor-about/issues/7))
- Fixed an issue in which invalid PIC clauses would not be reported as syntax errors.

## 0.3.11 - 2019/09/27

- "Unreachable Code" is not reported as an error anymore, but is now a warning message in the Problems View.
- Switch off "Unreachable Code" detection completely with this new setting: `"zopeneditor.cobol.enableUnreachableCodeWarnings": false`.
- We implemented GLOB pattern matching in Property Group settings for finding Copybooks on the local file system as requested in [this issue](https://github.com/IBM/zopeneditor-about/issues/5). Use with care as a very large search space will slow down the editor.
- We added support for [VS Code Multi-root Workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) allowing you to now specify Property Groups for finding Copybooks for a workspace comprising of many development project folders and Git repositories. To use it move your Property Groups to the Workspace File.
- We updated and revised our documentation for using Property Groups with patterns and workspaces in the [Online Help](https://ibm.github.io/zopeneditor-about/Docs/setting_propertygroup.html). We also added examples for using it on Windows versus Mac/Linux.
- Fixed an issue with using the Tab key in Code Snippets and when using it for indentation in the editor.

## 0.3.9 - 2019/09/23

- Just removed Preview flag in preparation for the announcement.
- Stay tuned for more cool things to come.

## 0.3.7 - 2019/09/17

- Fixes to the documentation and hyperlinks.
- Renamed extension preferences configuration name.

## 0.3.5 - 2019/09/13

- First public release evolving out of the Wazi technology preview. See README.md for details.
