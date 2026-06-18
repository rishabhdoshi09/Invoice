const Enums = require('../enums');

module.exports = (sequelize, Sequelize) => {
    const product = sequelize.define(
        'products',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            name: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            // Legacy field kept for backward compat
            pricePerKg: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: true
            },
            type: {
                type: Sequelize.ENUM(Object.values(Enums.product)),
                allowNull: true
            },

            // Production fields
            hsnCode: {
                type: Sequelize.STRING(20),
                allowNull: true,
                comment: 'HSN/SAC code for GST'
            },
            costPrice: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: true,
                defaultValue: 0,
                comment: 'Purchase cost (used for COGS calculation)'
            },
            sellingPrice: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: true,
                defaultValue: 0,
                comment: 'Default selling price (can be overridden per invoice line)'
            },
            currentStock: {
                type: Sequelize.DECIMAL(15, 3),
                allowNull: false,
                defaultValue: 0,
                comment: 'Live stock quantity; updated by stockTransaction records'
            },
            unit: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: 'KG'
            },
            isService: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'True for services (no stock tracking)'
            },
            isActive: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            description: {
                type: Sequelize.TEXT,
                allowNull: true
            }
        },
        {
            tableName: 'products',
            timestamps: true,
            indexes: [
                { fields: ['hsnCode'] },
                { fields: ['isActive'] }
            ]
        }
    );

    product.associate = (models) => {
        product.hasMany(models.stockTransaction, { foreignKey: 'productId', as: 'stockTransactions' });
    };

    return product;
};
