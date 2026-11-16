# Maintenance and product feedback

ServiceGrid IQ is an owner-maintained, working MVP. This repository presents the product and its engineering evidence. It is not currently operated as a community contribution program, and unsolicited pull requests are not part of the maintenance workflow.

## Product and business discussions

For a product evaluation, pilot, integration or acquisition discussion, use the [project owner's GitHub profile](https://github.com/saikoushikpallapolu) and the evaluation guidance in [README.md](README.md). Agree on scope and a suitable private channel before sharing operational records or proprietary material.

## Reporting an issue

Public reports should contain a non-sensitive description, expected behavior and reproducible steps using fictional data. Do not publish passwords, tokens, invitation links, private manuals, customer records, exports or database backups. Arrange a private channel with the owner before sharing exploitable security details.

## Maintainer verification

Owner-authorized changes must preserve server-side authorization, company boundaries, transaction guarantees and executable API contracts. Run checks appropriate to the change and update walkthroughs and verification records with actual results.

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm check:docs
```

Database and browser verification require configured local services; see [local development](docs/operations/local-development.md). Application CI provides the complete automated pipeline. Documentation checks alone do not verify application behavior.

## License

The existing [MIT License](LICENSE) remains in effect. This maintenance policy does not revoke permissions granted by that license. Proprietary customer data and third-party documents must not be committed to the public repository.
