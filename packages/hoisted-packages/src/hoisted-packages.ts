/**
 * Return a object of root and leaf dependencies to install
 * @returns {Object}
 */
function getDependenciesToInstall() {
    // Configuration for what packages to hoist may be in lerna.json or it may
    // come in as command line options.
    // RESUME: try to load the raw root package.json
    const rootPkg = this.project.manifest;

    // This will contain entries for each hoistable dependency.
    const rootSet = new Set();

    // This will map packages to lists of unhoistable dependencies
    const leaves = new Map();

    /**
     * Map of dependencies to install
     *
     * Map {
     *   "<externalName>": Map {
     *     "<versionRange>": Set { "<dependent1>", "<dependent2>", ... }
     *   }
     * }
     *
     * Example:
     *
     * Map {
     *   "react": Map {
     *     "15.x": Set { "my-component1", "my-component2", "my-component3" },
     *     "^0.14.0": Set { "my-component4" },
     *   }
     * }
     */
    const depsToInstall = new Map();
    const filteredNodes = new Map(
        this.filteredPackages.map(pkg => [pkg.name, this.targetGraph.get(pkg.name)])
    );

    // collect root dependency versions
    const mergedRootDeps = Object.assign(
        {},
        rootPkg.devDependencies,
        rootPkg.optionalDependencies,
        rootPkg.dependencies
    );
    const rootExternalVersions = new Map(
        Object.keys(mergedRootDeps).map(externalName => [externalName, mergedRootDeps[externalName]])
    );

    // seed the root dependencies
    rootExternalVersions.forEach((version, externalName) => {
        const externalDependents = new Set();
        const record = new Map();

        record.set(version, externalDependents);
        depsToInstall.set(externalName, record);
    });

    // build a map of external dependencies to install
    for (const [leafName, leafNode] of filteredNodes) {
        for (const [externalName, resolved] of leafNode.externalDependencies) {
            // rawSpec is something like "^1.2.3"
            const version = resolved.rawSpec;
            const record =
                depsToInstall.get(externalName) || depsToInstall.set(externalName, new Map()).get(externalName);
            const externalDependents = record.get(version) || record.set(version, new Set()).get(version);

            externalDependents.add(leafName);
        }
    }

    const rootActions = [];
    const leafActions = [];
    // We don't want to exit on the first hoist issue, but log them all and then exit
    let strictExitOnWarning = false;

    // determine where each dependency will be installed
    for (const [externalName, externalDependents] of depsToInstall) {
        let rootVersion;

        if (this.hoisting && isHoistedPackage(externalName, this.hoisting)) {
            const commonVersion = Array.from(externalDependents.keys()).reduce((a, b) =>
                externalDependents.get(a).size > externalDependents.get(b).size ? a : b
                                                                              );

            // Get the version required by the repo root (if any).
            // If the root doesn't have a dependency on this package then we'll
            // install the most common dependency there.
            rootVersion = rootExternalVersions.get(externalName) || commonVersion;

            if (rootVersion !== commonVersion) {
                this.logger.warn(
                    "EHOIST_ROOT_VERSION",
                    `The repository root depends on ${externalName}@${rootVersion}, ` +
                        `which differs from the more common ${externalName}@${commonVersion}.`
                );
                if (this.options.strict) {
                    strictExitOnWarning = true;
                }
            }

            const dependents = Array.from(externalDependents.get(rootVersion)).map(
                leafName => this.targetGraph.get(leafName).pkg
            );

            // remove collection so leaves don't repeat it
            externalDependents.delete(rootVersion);

            // Install the best version we can in the repo root.
            // Even if it's already installed there we still need to make sure any
            // binaries are linked to the packages that depend on them.
            rootActions.push(() =>
                hasDependencyInstalled(rootPkg, externalName, rootVersion).then(isSatisfied => {
                    rootSet.add({
                        name: externalName,
                        dependents,
                        dependency: `${externalName}@${rootVersion}`,
                        isSatisfied,
                    });
                })
                            );
        }

        // Add less common versions to package installs.
        for (const [leafVersion, leafDependents] of externalDependents) {
            for (const leafName of leafDependents) {
                if (rootVersion) {
                    this.logger.warn(
                        "EHOIST_PKG_VERSION",
                        `"${leafName}" package depends on ${externalName}@${leafVersion}, ` +
                            `which differs from the hoisted ${externalName}@${rootVersion}.`
                    );
                    if (this.options.strict) {
                        strictExitOnWarning = true;
                    }
                }

                const leafNode = this.targetGraph.get(leafName);
                const leafRecord = leaves.get(leafNode) || leaves.set(leafNode, new Set()).get(leafNode);

                // only install dependency if it's not already installed
                leafActions.push(() =>
                    hasDependencyInstalled(leafNode.pkg, externalName, leafVersion).then(isSatisfied => {
                        leafRecord.add({
                            dependency: `${externalName}@${leafVersion}`,
                            isSatisfied,
                        });
                    })
                                );
            }
        }
    }
    if (this.options.strict && strictExitOnWarning) {
        throw new ValidationError(
            "EHOISTSTRICT",
            "Package version inconsistencies found while hoisting. Fix the above warnings and retry."
        );
    }

    return pMapSeries([...rootActions, ...leafActions], el => el()).then(() => {
        this.logger.silly("root dependencies", JSON.stringify(rootSet, null, 2));
        this.logger.silly("leaf dependencies", JSON.stringify(leaves, null, 2));

        return { rootSet, leaves };
    });
}
