const bcrypt = require('bcryptjs');

module.exports = (sequelize, Sequelize) => {
    const user = sequelize.define(
        'users',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            username: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
            },
            password: {
                type: Sequelize.STRING,
                allowNull: false
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false
            },
            email: {
                type: Sequelize.STRING,
                allowNull: true
            },
            role: {
                type: Sequelize.ENUM('admin', 'billing_staff'),
                defaultValue: 'billing_staff',
                allowNull: false
            },
            isActive: {
                type: Sequelize.BOOLEAN,
                defaultValue: true
            },
            lastLogin: {
                type: Sequelize.DATE,
                allowNull: true
            },
            // Soft delete fields
            isDeleted: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            deletedAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            deletedBy: {
                type: Sequelize.UUID,
                allowNull: true
            }
        },
        {
            hooks: {
                beforeCreate: async (user) => {
                    if (user.password) {
                        const salt = await bcrypt.genSalt(10);
                        user.password = await bcrypt.hash(user.password, salt);
                    }
                },
                beforeUpdate: async (user) => {
                    if (user.changed('password')) {
                        const salt = await bcrypt.genSalt(10);
                        user.password = await bcrypt.hash(user.password, salt);
                    }
                }
            }
        }
    );

    user.prototype.comparePassword = async function(candidatePassword) {
        return bcrypt.compare(candidatePassword, this.password);
    };

    user.prototype.toSafeJSON = function() {
        const values = { ...this.get() };
        delete values.password;
        return values;
    };

    return user;
};
